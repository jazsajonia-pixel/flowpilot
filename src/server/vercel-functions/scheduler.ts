import { and, asc, eq, sql } from 'drizzle-orm';
import { db, getDbForSignal } from '../../db';
import { connections, executions, executionLogs, workflowNodes, workflows } from '../../db/schema';
import { findOwnedAICredential } from '../../server/ai/owned-credential-lookup';
import { createOwnerAIProviderResolver } from '../../server/ai/provider-resolver';
import { createOwnerEmailNotifier } from '../../server/notifications/owner-email';
import { createOwnerDataStore } from '../../server/data/owner-data-store';
import { executeWorkflowGraph } from '../../server/execution/engine';
import { handleScheduleTick, type ScheduleExecutionStore } from '../../server/workflows/schedule-trigger-core';

/**
 * Internal Vercel Cron target (GET /api/internal/schedule-tick).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; the handler fails closed without it.
 */
export function createScheduleStore(): ScheduleExecutionStore {
  return {
    async listActiveScheduledWorkflows(limit) {
      return db
        .select({ id: workflows.id, ownerId: workflows.ownerId })
        .from(workflows)
        .where(and(
          eq(workflows.isActive, true),
          sql`exists (select 1 from ${workflowNodes} where ${workflowNodes.workflowId} = ${workflows.id} and ${workflowNodes.category} = 'schedule_trigger')`,
        ))
        .orderBy(asc(workflows.createdAt))
        .limit(limit);
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
    async claimExecution(workflowId, scheduledAt, triggerData) {
      const [created] = await db
        .insert(executions)
        .values({ workflowId, status: 'pending', triggerData, scheduledAt })
        .onConflictDoNothing({ target: [executions.workflowId, executions.scheduledAt] })
        .returning({ id: executions.id });
      return created ?? null;
    },
    async markRunning(workflowId, executionId, startedAt) {
      await db
        .update(executions)
        .set({ status: 'running', startedAt })
        .where(and(eq(executions.id, executionId), eq(executions.workflowId, workflowId)));
    },
    async appendLogs(executionId, logs, signal) {
      await getDbForSignal(signal).insert(executionLogs).values(
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
    async finishExecution(workflowId, executionId, result, completedAt, signal) {
      await getDbForSignal(signal)
        .update(executions)
        .set({ status: result.status, completedAt, error: result.error ?? null })
        .where(and(eq(executions.id, executionId), eq(executions.workflowId, workflowId)));
    },
    async failExecution(workflowId, executionId, signal) {
      await getDbForSignal(signal)
        .update(executions)
        .set({ status: 'failed', completedAt: new Date(), error: 'Execution persistence failed.' })
        .where(and(eq(executions.id, executionId), eq(executions.workflowId, workflowId)));
    },
  };
}

export default async function scheduler(request: Request): Promise<Response> {
  return handleScheduleTick(request, {
    cronSecret: process.env.CRON_SECRET,
    store: createScheduleStore(),
    runGraph: async (graph, input, ownerId) => {
      const sendEmail = createOwnerEmailNotifier(ownerId);
      return executeWorkflowGraph(graph, input, {
        triggerCategory: 'schedule_trigger',
        resolveAIProvider: createOwnerAIProviderResolver(ownerId, findOwnedAICredential),
        dataStore: createOwnerDataStore(ownerId),
        ...(sendEmail ? { sendEmail } : {}),
      });
    },
  });
}
