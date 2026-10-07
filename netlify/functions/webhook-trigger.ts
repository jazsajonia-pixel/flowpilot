import type { Config, Context } from '@netlify/functions';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db';
import { connections, credentials, executions, executionLogs, workflowNodes, workflows } from '../../src/db/schema';
import { jsonResponse, parseJsonBody } from '../../src/server/auth/http';
import { executeWorkflowGraph } from '../../src/server/execution/engine';
import { summarizeTriggerInput } from '../../src/server/execution/logging';
import { createOwnerAIProviderResolver } from '../../src/server/ai/provider-resolver';
import { isAIProviderId } from '../../src/types/ai';
import { workflowGraphSchema } from '../../src/server/workflows/graph-validation';
import { webhookBodySchema } from '../../src/server/workflows/webhook-validation';

const MAX_WEBHOOK_BODY_BYTES = 16 * 1024;
const notFoundResponse = () => jsonResponse(404, { error: 'Workflow not found.' });

export const config: Config = {
  path: '/api/hooks/:webhookToken',
  method: ['POST'],
};

export default async function webhookTrigger(request: Request, context: Context): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  }

  const token = context.params.webhookToken;
  if (!token || token.length > 64) return notFoundResponse();

  let startedExecutionId: string | null = null;
  let startedWorkflowId: string | null = null;
  try {
    const [workflow] = await db
      .select({ id: workflows.id, ownerId: workflows.ownerId, isActive: workflows.isActive })
      .from(workflows)
      .where(and(eq(workflows.webhookToken, token), eq(workflows.isActive, true)))
      .limit(1);
    if (!workflow) return notFoundResponse();

    const body = await parseJsonBody(request, MAX_WEBHOOK_BODY_BYTES);
    if (!body.ok) return jsonResponse(body.status, { error: body.message });
    const parsedBody = webhookBodySchema.safeParse(body.value);
    if (!parsedBody.success) return jsonResponse(400, { error: 'Webhook body must be a JSON object.' });
    const triggerInput = parsedBody.data;

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
        .where(eq(workflowNodes.workflowId, workflow.id)),
      db
        .select({
          id: connections.id,
          sourceNodeId: connections.sourceNodeId,
          sourceHandle: connections.sourceHandle,
          targetNodeId: connections.targetNodeId,
          targetHandle: connections.targetHandle,
        })
        .from(connections)
        .where(eq(connections.workflowId, workflow.id)),
    ]);

    const parsedGraph = workflowGraphSchema.safeParse({ nodes, connections: savedConnections });
    if (!parsedGraph.success) return jsonResponse(422, { error: 'Workflow graph is invalid. Review its node settings and connections.' });
    const triggerNodes = parsedGraph.data.nodes.filter((node) => node.type === 'trigger');
    if (triggerNodes.length !== 1 || triggerNodes[0].category !== 'webhook_trigger') return notFoundResponse();
    if (parsedGraph.data.nodes.length > 50) return jsonResponse(422, { error: 'A webhook run is limited to 50 workflow nodes.' });

    const [created] = await db
      .insert(executions)
      .values({ workflowId: workflow.id, status: 'pending', triggerData: summarizeTriggerInput(triggerInput) })
      .returning({ id: executions.id, createdAt: executions.createdAt });
    if (!created) return jsonResponse(503, { error: 'Workflow execution could not be started.' });
    startedExecutionId = created.id;
    startedWorkflowId = workflow.id;

    const startedAt = new Date();
    await db
      .update(executions)
      .set({ status: 'running', startedAt })
      .where(and(eq(executions.id, created.id), eq(executions.workflowId, workflow.id)));

    const resolveAIProvider = createOwnerAIProviderResolver(workflow.ownerId, async (ownerId, credentialId, provider) => {
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

    const result = await executeWorkflowGraph(parsedGraph.data, triggerInput, {
      triggerCategory: 'webhook_trigger',
      resolveAIProvider,
    });
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
      .where(and(eq(executions.id, created.id), eq(executions.workflowId, workflow.id)));

    return jsonResponse(200, {
      execution: {
        id: created.id,
        workflowId: workflow.id,
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
    console.error('[webhook.trigger] Webhook execution request failed.');
    return jsonResponse(503, { error: 'Workflow execution service unavailable.' });
  }
}
