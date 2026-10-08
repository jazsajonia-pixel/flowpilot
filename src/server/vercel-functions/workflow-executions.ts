import type { Config, Context } from '@netlify/functions';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { connections, credentials, executions, executionLogs, workflowNodes, workflows } from '../../db/schema';
import { getRequestUser } from '../../server/auth/request-user';
import { isSameOriginRequest, jsonResponse, parseJsonBody } from '../../server/auth/http';
import { createOwnerEmailNotifier } from '../../server/notifications/owner-email';
import { createOwnerDataStore } from '../../server/data/owner-data-store';
import { executeWorkflowGraph } from '../../server/execution/engine';
import { summarizeTriggerInput } from '../../server/execution/logging';
import { isAIProviderId } from '../../types/ai';
import { createOwnerAIProviderResolver } from '../../server/ai/provider-resolver';
import { workflowGraphSchema } from '../../server/workflows/graph-validation';
import { workflowOwnerScope } from '../../server/workflows/ownership';
import { workflowIdSchema } from '../../server/workflows/validation';

const MAX_EXECUTION_BODY_BYTES = 16 * 1024;
const startExecutionSchema = z.object({ input: z.record(z.unknown()).optional() }).strict();

export const config: Config = {
  path: '/api/workflows/:workflowId/executions',
  method: ['POST'],
};

export default async function workflowExecutions(request: Request, context: Context): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  }
  if (!isSameOriginRequest(request)) return jsonResponse(403, { error: 'Cross-origin request rejected.' });

  let startedExecutionId: string | null = null;
  let startedWorkflowId: string | null = null;
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });

    const workflowIdResult = workflowIdSchema.safeParse(context.params.workflowId);
    if (!workflowIdResult.success) return jsonResponse(404, { error: 'Workflow not found.' });
    const workflowId = workflowIdResult.data;

    const body = await parseJsonBody(request, MAX_EXECUTION_BODY_BYTES);
    if (!body.ok) return jsonResponse(body.status, { error: body.message });
    const parsedBody = startExecutionSchema.safeParse(body.value);
    if (!parsedBody.success) return jsonResponse(400, { error: 'Execution input must be a JSON object.' });
    const triggerInput = parsedBody.data.input ?? {};

    const [owned] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(workflowOwnerScope(workflowId, user.id))
      .limit(1);
    if (!owned) return jsonResponse(404, { error: 'Workflow not found.' });
    startedWorkflowId = workflowId;

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

    const parsedGraph = workflowGraphSchema.safeParse({ nodes, connections: savedConnections });
    if (!parsedGraph.success) return jsonResponse(422, { error: 'Workflow graph is invalid. Review its node settings and connections.' });
    const triggerNodes = parsedGraph.data.nodes.filter((node) => node.type === 'trigger');
    if (triggerNodes.length !== 1 || triggerNodes[0].category !== 'manual_trigger') {
      return jsonResponse(422, { error: 'Manual runs require one Manual Trigger. Webhook and Schedule Trigger workflows run after activation.' });
    }
    if (parsedGraph.data.nodes.length > 50) return jsonResponse(422, { error: 'A manual run is limited to 50 workflow nodes.' });

    const [created] = await db
      .insert(executions)
      .values({ workflowId, status: 'pending', triggerData: summarizeTriggerInput(triggerInput) })
      .returning({ id: executions.id, createdAt: executions.createdAt });
    if (!created) return jsonResponse(503, { error: 'Workflow execution could not be started.' });
    startedExecutionId = created.id;

    const startedAt = new Date();
    await db
      .update(executions)
      .set({ status: 'running', startedAt })
      .where(and(eq(executions.id, created.id), eq(executions.workflowId, workflowId)));

    const resolveAIProvider = createOwnerAIProviderResolver(user.id, async (ownerId, credentialId, provider) => {
      const [credential] = await db
        .select({
          id: credentials.id,
          ownerId: credentials.ownerId,
          provider: credentials.provider,
          encryptedPayload: credentials.encryptedPayload,
        })
        .from(credentials)
        .where(and(
          eq(credentials.id, credentialId),
          eq(credentials.ownerId, ownerId),
          eq(credentials.provider, provider),
        ))
        .limit(1);
      if (!credential || !isAIProviderId(credential.provider)) return null;
      return { ...credential, provider: credential.provider };
    });

    const sendEmail = createOwnerEmailNotifier(user.id);
    const result = await executeWorkflowGraph(parsedGraph.data, triggerInput, { resolveAIProvider, dataStore: createOwnerDataStore(user.id), ...(sendEmail ? { sendEmail } : {}) });
    if (result.logs.length > 0) {
      await db.insert(executionLogs).values(
        result.logs.map((log) => ({
          executionId: created.id,
          nodeId: log.nodeId,
          status: log.status,
          inputData: log.inputData,
          outputData: log.outputData,
          error: log.error,
          timestamp: new Date(log.timestamp),
        })),
      );
    }

    const completedAt = new Date();
    await db
      .update(executions)
      .set({ status: result.status, completedAt, error: result.error ?? null })
      .where(and(eq(executions.id, created.id), eq(executions.workflowId, workflowId)));

    return jsonResponse(200, {
      execution: {
        id: created.id,
        workflowId,
        status: result.status,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        error: result.error ?? null,
        logs: result.logs,
      },
    });
  } catch {
    if (startedExecutionId && startedWorkflowId) {
      try {
        await db
          .update(executions)
          .set({ status: 'failed', completedAt: new Date(), error: 'Execution persistence failed.' })
          .where(and(eq(executions.id, startedExecutionId), eq(executions.workflowId, startedWorkflowId)));
      } catch {
        // The database may be unavailable; do not expose or log internal details.
      }
    }
    console.error('[workflow.executions] Execution request failed.');
    return jsonResponse(503, { error: 'Workflow execution service unavailable.' });
  }
}
