import type { Config, Context } from '@netlify/functions';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { connections, workflowNodes, workflows } from '../../db/schema';
import { getRequestUser } from '../../server/auth/request-user';
import { isSameOriginRequest, jsonResponse, parseJsonBody } from '../../server/auth/http';
import { workflowOwnerScope } from '../../server/workflows/ownership';
import { checkWorkflowActivation } from '../../server/workflows/activation';
import { workflowGraphSchema } from '../../server/workflows/graph-validation';
import { workflowIdSchema } from '../../server/workflows/validation';

const MAX_GRAPH_BODY_BYTES = 512 * 1024;

export const config: Config = {
  path: '/api/workflows/:workflowId/graph',
  method: ['GET', 'PUT'],
};

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export default async function workflowGraph(request: Request, context: Context): Promise<Response> {
  if (request.method === 'PUT' && !isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }

  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });

    const idResult = workflowIdSchema.safeParse(context.params.workflowId);
    if (!idResult.success) return jsonResponse(404, { error: 'Workflow not found.' });
    const workflowId = idResult.data;
    const ownerScope = workflowOwnerScope(workflowId, user.id);

    if (request.method === 'GET') {
      const [owned] = await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(ownerScope)
        .limit(1);
      if (!owned) return jsonResponse(404, { error: 'Workflow not found.' });

      const [nodes, savedConnections] = await Promise.all([
        db
          .select({
            id: workflowNodes.id,
            type: workflowNodes.type,
            category: workflowNodes.category,
            label: workflowNodes.label,
            position: workflowNodes.position,
            config: workflowNodes.config,
          })
          .from(workflowNodes)
          .where(eq(workflowNodes.workflowId, workflowId)),
        db
          .select({
            id: connections.id,
            sourceNodeId: connections.sourceNodeId,
            sourceHandle: connections.sourceHandle,
            targetNodeId: connections.targetNodeId,
            targetHandle: connections.targetHandle,
          })
          .from(connections)
          .where(eq(connections.workflowId, workflowId)),
      ]);

      const parsed = workflowGraphSchema.safeParse({ nodes, connections: savedConnections });
      if (!parsed.success) {
        console.error('[workflow.graph] Stored workflow graph failed validation.');
        return jsonResponse(500, { error: 'Stored workflow graph is invalid.' });
      }
      return jsonResponse(200, { graph: parsed.data });
    }

    if (request.method !== 'PUT') {
      return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, PUT' });
    }

    const body = await parseJsonBody(request, MAX_GRAPH_BODY_BYTES);
    if (!body.ok) return jsonResponse(body.status, { error: body.message });
    const parsed = workflowGraphSchema.safeParse(body.value);
    if (!parsed.success) {
      return jsonResponse(400, {
        error: 'Invalid workflow graph.',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }

    const graph = parsed.data;
    const [owned] = await db
      .select({ id: workflows.id, isActive: workflows.isActive })
      .from(workflows)
      .where(ownerScope)
      .limit(1);
    if (!owned) return jsonResponse(404, { error: 'Workflow not found.' });

    // An active workflow whose new graph could no longer be activated is deactivated in the same batch.
    let deactivate = false;
    if (owned.isActive) {
      const activation = await checkWorkflowActivation(graph, async () => {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(workflows)
          .where(and(
            eq(workflows.isActive, true),
            ne(workflows.id, workflowId),
            sql`exists (select 1 from ${workflowNodes} where ${workflowNodes.workflowId} = ${workflows.id} and ${workflowNodes.category} = 'schedule_trigger')`,
          ));
        return row?.count ?? 0;
      });
      deactivate = !activation.ok;
    }

    // The Neon HTTP driver has no interactive transactions; db.batch runs these statements atomically.
    const nodeInsert = graph.nodes.length > 0
      ? [db.insert(workflowNodes).values(
        graph.nodes.map((node) => ({
          id: node.id,
          workflowId,
          type: node.type,
          category: node.category,
          label: node.label,
          position: node.position,
          config: node.config,
        })),
      )]
      : [];
    const connectionInsert = graph.connections.length > 0
      ? [db.insert(connections).values(
        graph.connections.map((connection) => ({
          id: connection.id,
          workflowId,
          sourceNodeId: connection.sourceNodeId,
          sourceHandle: connection.sourceHandle ?? null,
          targetNodeId: connection.targetNodeId,
          targetHandle: connection.targetHandle ?? null,
        })),
      )]
      : [];
    await db.batch([
      db.delete(connections).where(eq(connections.workflowId, workflowId)),
      db.delete(workflowNodes).where(eq(workflowNodes.workflowId, workflowId)),
      ...nodeInsert,
      ...connectionInsert,
      db
        .update(workflows)
        .set({ updatedAt: new Date(), ...(deactivate ? { isActive: false } : {}) })
        .where(ownerScope),
    ]);

    return jsonResponse(200, { ok: true, deactivated: deactivate });
  } catch (error) {
    if (request.method === 'PUT' && hasDatabaseErrorCode(error, '23503')) {
      return jsonResponse(400, { error: 'Workflow graph references invalid nodes.' });
    }
    console.error('[workflow.graph] Workflow graph request failed.');
    return jsonResponse(503, { error: 'Workflow service unavailable.' });
  }
}
