import type { Config, Context } from '@netlify/functions';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db';
import { connections, credentials, executions, executionLogs, workflowNodes, workflows } from '../../src/db/schema';
import { createOwnerAIProviderResolver } from '../../src/server/ai/provider-resolver';
import { executeWorkflowGraph } from '../../src/server/execution/engine';
import { handleWebhookRequest } from '../../src/server/workflows/webhook-trigger-core';
import type { WorkflowGraphInput } from '../../src/server/workflows/graph-validation';
import { isAIProviderId } from '../../src/types/ai';

export const config: Config = {
  path: '/api/hooks/:webhookToken',
  method: ['POST'],
};

export default async function webhookTrigger(request: Request, context: Context): Promise<Response> {
  return handleWebhookRequest(request, context.params.webhookToken, {
    store: {
      async findActiveWorkflow(token) {
        const [workflow] = await db
          .select({ id: workflows.id, ownerId: workflows.ownerId })
          .from(workflows)
          .where(and(eq(workflows.webhookToken, token), eq(workflows.isActive, true)))
          .limit(1);
        return workflow ?? null;
      },
      async loadGraph(workflowId) {
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
        return { nodes, connections: savedConnections };
      },
      async createExecution(workflowId, triggerData) {
        const [created] = await db
          .insert(executions)
          .values({ workflowId, status: 'pending', triggerData })
          .returning({ id: executions.id });
        return created ?? null;
      },
      async markRunning(workflowId, executionId, startedAt) {
        await db
          .update(executions)
          .set({ status: 'running', startedAt })
          .where(and(eq(executions.id, executionId), eq(executions.workflowId, workflowId)));
      },
      async appendLogs(executionId, logs) {
        await db.insert(executionLogs).values(
          logs.map((log) => ({
            executionId,
            nodeId: log.nodeId,
            status: log.status,
            inputData: log.inputData,
            outputData: log.outputData,
            error: log.error,
            timestamp: new Date(log.timestamp),
          })),
        );
      },
      async finishExecution(workflowId, executionId, result, completedAt) {
        await db
          .update(executions)
          .set({ status: result.status, completedAt, error: result.error ?? null })
          .where(and(eq(executions.id, executionId), eq(executions.workflowId, workflowId)));
      },
      async failExecution(workflowId, executionId) {
        await db
          .update(executions)
          .set({ status: 'failed', completedAt: new Date(), error: 'Execution persistence failed.' })
          .where(and(eq(executions.id, executionId), eq(executions.workflowId, workflowId)));
      },
    },
    runGraph: async (graph, input, ownerId) => executeWorkflowGraphWithOwner(graph, input, ownerId),
  });
}

async function executeWorkflowGraphWithOwner(
  graph: WorkflowGraphInput,
  input: Record<string, unknown>,
  ownerId: string,
) {
  const resolveAIProvider = createOwnerAIProviderResolver(ownerId, async (credentialOwnerId, credentialId, provider) => {
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
        eq(credentials.ownerId, credentialOwnerId),
        eq(credentials.provider, provider),
      ))
      .limit(1);
    if (!credential || !isAIProviderId(credential.provider)) return null;
    return { ...credential, provider: credential.provider };
  });

  return executeWorkflowGraph(graph, input, { triggerCategory: 'webhook_trigger', resolveAIProvider });
}
