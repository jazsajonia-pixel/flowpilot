import type { Config, Context } from '@netlify/functions';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { connections, executions, executionLogs, workflowNodes, workflows } from '../../db/schema';
import { findOwnedAICredential } from '../../server/ai/owned-credential-lookup';
import { createOwnerAIProviderResolver } from '../../server/ai/provider-resolver';
import { createOwnerEmailNotifier } from '../../server/notifications/owner-email';
import { executeWorkflowGraph } from '../../server/execution/engine';
import { handleWebhookRequest } from '../../server/workflows/webhook-trigger-core';
import type { WorkflowGraphInput } from '../../server/workflows/graph-validation';

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
  const resolveAIProvider = createOwnerAIProviderResolver(ownerId, findOwnedAICredential);
  const sendEmail = createOwnerEmailNotifier(ownerId);
  return executeWorkflowGraph(graph, input, { triggerCategory: 'webhook_trigger', resolveAIProvider, ...(sendEmail ? { sendEmail } : {}) });
}
