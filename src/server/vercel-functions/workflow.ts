import type { Config, Context } from '@netlify/functions';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { connections, workflowNodes, workflows } from '../../db/schema';
import { isSameOriginRequest, jsonResponse, parseJsonBody } from '../../server/auth/http';
import { getRequestUser } from '../../server/auth/request-user';
import { checkWorkflowActivation } from '../../server/workflows/activation';
import { workflowOwnerScope } from '../../server/workflows/ownership';
import { updateWorkflowSchema, workflowIdSchema } from '../../server/workflows/validation';

export const config: Config = {
  path: '/api/workflows/:workflowId',
  method: ['GET', 'PATCH', 'DELETE'],
};

const workflowFields = {
  id: workflows.id,
  title: workflows.title,
  description: workflows.description,
  isActive: workflows.isActive,
  webhookToken: workflows.webhookToken,
  createdAt: workflows.createdAt,
  updatedAt: workflows.updatedAt,
};

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export default async function workflowItem(request: Request, context: Context): Promise<Response> {
  const isMutation = request.method === 'PATCH' || request.method === 'DELETE';
  if (isMutation && !isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }

  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });

    const idResult = workflowIdSchema.safeParse(context.params.workflowId);
    if (!idResult.success) return jsonResponse(404, { error: 'Workflow not found.' });
    const workflowId = idResult.data;
    const ownershipScope = workflowOwnerScope(workflowId, user.id);

    if (request.method === 'GET') {
      const [workflow] = await db
        .select(workflowFields)
        .from(workflows)
        .where(ownershipScope)
        .limit(1);
      return workflow
        ? jsonResponse(200, { workflow })
        : jsonResponse(404, { error: 'Workflow not found.' });
    }

    if (request.method === 'PATCH') {
      const body = await parseJsonBody(request);
      if (!body.ok) return jsonResponse(body.status, { error: body.message });
      const parsed = updateWorkflowSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonResponse(400, {
          error: 'Invalid workflow update.',
          fields: parsed.error.flatten().fieldErrors,
        });
      }

      if (parsed.data.isActive === true) {
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
        const activation = await checkWorkflowActivation(
          { nodes, connections: savedConnections },
          async () => {
            const [row] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(workflows)
              .where(and(
                eq(workflows.isActive, true),
                ne(workflows.id, workflowId),
                sql`exists (select 1 from ${workflowNodes} where ${workflowNodes.workflowId} = ${workflows.id} and ${workflowNodes.category} = 'schedule_trigger')`,
              ));
            return row?.count ?? 0;
          },
        );
        if (!activation.ok) return jsonResponse(activation.status, { error: activation.error });
      }

      const [workflow] = await db
        .update(workflows)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(ownershipScope)
        .returning(workflowFields);
      return workflow
        ? jsonResponse(200, { workflow })
        : jsonResponse(404, { error: 'Workflow not found.' });
    }

    if (request.method === 'DELETE') {
      const [deleted] = await db
        .delete(workflows)
        .where(ownershipScope)
        .returning({ id: workflows.id });
      return deleted
        ? jsonResponse(200, { ok: true })
        : jsonResponse(404, { error: 'Workflow not found.' });
    }

    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, PATCH, DELETE' });
  } catch (error) {
    if (request.method === 'DELETE' && hasDatabaseErrorCode(error, '23503')) {
      return jsonResponse(409, { error: 'Workflow has dependent records and cannot be deleted.' });
    }
    console.error('[workflows.item] Workflow request failed.');
    return jsonResponse(503, { error: 'Workflow service unavailable.' });
  }
}
