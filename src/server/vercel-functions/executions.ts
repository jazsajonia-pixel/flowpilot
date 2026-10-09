import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db, getDbForSignal } from '../../db';
import { connections, executionLogs, executions, workflowNodes, workflows } from '../../db/schema';
import { getRequestUser } from '../../server/auth/request-user';
import { isSameOriginRequest, jsonResponse } from '../../server/auth/http';
import { findOwnedAICredential } from '../../server/ai/owned-credential-lookup';
import { createOwnerAIProviderResolver } from '../../server/ai/provider-resolver';
import { createOwnerDataStore } from '../../server/data/owner-data-store';
import { executeWorkflowGraph } from '../../server/execution/engine';
import { createExecutionFailureSignal, createExecutionFinalizationSignal } from '../../server/execution/persistence-timeout';
import { createOwnerEmailNotifier } from '../../server/notifications/owner-email';
import { planRetry, retryOfFrom, type RetryTriggerCategory } from '../../server/executions/retry';
import { workflowGraphSchema } from '../../server/workflows/graph-validation';
import {
  categoryOfLog,
  durationMs,
  encodeExecutionCursor,
  EXECUTION_PAGE_SIZE,
  isInterrupted,
  parseExecutionListQuery,
  stepLabel,
  triggerFromCategory,
} from '../../server/executions/history';

const triggerCategorySql = sql<string | null>`(
  select ${executionLogs.inputData}->>'category' from ${executionLogs}
  where ${executionLogs.executionId} = ${executions.id} and ${executionLogs.inputData}->>'category' like '%\\_trigger'
  limit 1
)`;
const stepCountSql = (status: 'success' | 'error' | 'skipped') => sql<number>`(
  select count(*)::int from ${executionLogs}
  where ${executionLogs.executionId} = ${executions.id} and ${executionLogs.status} = ${status}
)`;

const summaryFields = {
  id: executions.id,
  workflowId: executions.workflowId,
  workflowTitle: workflows.title,
  status: executions.status,
  error: executions.error,
  createdAt: executions.createdAt,
  startedAt: executions.startedAt,
  completedAt: executions.completedAt,
  scheduledAt: executions.scheduledAt,
  retryOf: sql<string | null>`${executions.triggerData}->>'retryOf'`,
  triggerCategory: triggerCategorySql,
  succeeded: stepCountSql('success'),
  failed: stepCountSql('error'),
  skipped: stepCountSql('skipped'),
};

type SummaryRow = {
  id: string; workflowId: string; workflowTitle: string; status: string; error: string | null;
  createdAt: Date; startedAt: Date | null; completedAt: Date | null; scheduledAt: Date | null;
  triggerCategory: string | null; retryOf: string | null; succeeded: number; failed: number; skipped: number;
};

function toSummary(row: SummaryRow, now: Date) {
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowTitle: row.workflowTitle,
    status: row.status,
    interrupted: isInterrupted(row.status, row.createdAt, now),
    trigger: triggerFromCategory(row.triggerCategory, row.scheduledAt),
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    durationMs: durationMs(row.startedAt, row.completedAt),
    retryOf: row.retryOf,
    steps: { succeeded: row.succeeded, failed: row.failed, skipped: row.skipped },
  };
}

/** GET /api/executions — owner's execution history, newest first, cursor-paginated. */
export async function listExecutions(request: Request): Promise<Response> {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });
    const query = parseExecutionListQuery(new URL(request.url).searchParams);
    if (!query) return jsonResponse(400, { error: 'Invalid execution filters.' });

    const conditions: SQL[] = [eq(workflows.ownerId, user.id)];
    if (query.status) conditions.push(eq(executions.status, query.status));
    if (query.workflowId) conditions.push(eq(executions.workflowId, query.workflowId));
    if (query.cursor) {
      conditions.push(sql`(${executions.createdAt}, ${executions.id}) < (${query.cursor.createdAt.toISOString()}::timestamptz, ${query.cursor.id}::uuid)`);
    }
    const rows = await db
      .select(summaryFields)
      .from(executions)
      .innerJoin(workflows, eq(workflows.id, executions.workflowId))
      .where(and(...conditions))
      .orderBy(desc(executions.createdAt), desc(executions.id))
      .limit(EXECUTION_PAGE_SIZE + 1);
    const page = rows.slice(0, EXECUTION_PAGE_SIZE) as SummaryRow[];
    const last = page.at(-1);
    const now = new Date();
    return jsonResponse(200, {
      executions: page.map((row) => toSummary(row, now)),
      nextCursor: rows.length > EXECUTION_PAGE_SIZE && last ? encodeExecutionCursor({ createdAt: last.createdAt, id: last.id }) : null,
    });
  } catch {
    console.error('[executions.list] Execution history request failed.');
    return jsonResponse(503, { error: 'Execution history unavailable.' });
  }
}

/** GET /api/executions/:executionId — one owned execution with its safe step logs. */
export async function getExecution(request: Request, context: { params: Record<string, string> }): Promise<Response> {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });
    const id = z.string().uuid().safeParse(context.params.executionId);
    if (!id.success) return jsonResponse(404, { error: 'Execution not found.' });

    const [row] = await db
      .select({ ...summaryFields, triggerData: executions.triggerData })
      .from(executions)
      .innerJoin(workflows, eq(workflows.id, executions.workflowId))
      .where(and(eq(executions.id, id.data), eq(workflows.ownerId, user.id)))
      .limit(1);
    if (!row) return jsonResponse(404, { error: 'Execution not found.' });

    const [logs, nodes] = await Promise.all([
      db
        .select({ nodeId: executionLogs.nodeId, status: executionLogs.status, inputData: executionLogs.inputData, outputData: executionLogs.outputData, error: executionLogs.error, timestamp: executionLogs.timestamp })
        .from(executionLogs)
        .where(eq(executionLogs.executionId, row.id))
        .orderBy(asc(executionLogs.timestamp), asc(executionLogs.id))
        .limit(200),
      db.select({ id: workflowNodes.id, label: workflowNodes.label }).from(workflowNodes).where(eq(workflowNodes.workflowId, row.workflowId)),
    ]);
    const labels = new Map(nodes.map((node) => [node.id, node.label]));
    const summary = toSummary(row as SummaryRow, new Date());
    const [graphNodes, [retriedBy]] = await Promise.all([
      db.select({ type: workflowNodes.type, category: workflowNodes.category }).from(workflowNodes).where(eq(workflowNodes.workflowId, row.workflowId)),
      db.select({ id: executions.id }).from(executions)
        .where(and(eq(executions.workflowId, row.workflowId), sql`${executions.triggerData}->>'retryOf' = ${row.id}`))
        .limit(1),
    ]);
    const plan = planRetry({ id: row.id, status: row.status, interrupted: summary.interrupted, trigger: summary.trigger, triggerData: row.triggerData }, triggerCategoryOf(graphNodes));
    return jsonResponse(200, {
      execution: {
        ...summary,
        triggerData: row.triggerData ?? null,
        retryOf: retryOfFrom(row.triggerData),
        retriedBy: retriedBy?.id ?? null,
        retry: retriedBy ? { allowed: false, reason: 'This run was already retried.' } : plan.ok ? { allowed: true, reason: null } : { allowed: false, reason: plan.error },
        logs: logs.map((log) => {
          const category = categoryOfLog(log.inputData);
          return {
            nodeId: log.nodeId,
            label: stepLabel(log.nodeId, category, labels),
            category,
            nodeExists: labels.has(log.nodeId),
            status: log.status,
            timestamp: log.timestamp.toISOString(),
            outputData: log.outputData ?? null,
            error: log.error ?? null,
          };
        }),
      },
    });
  } catch {
    console.error('[executions.detail] Execution detail request failed.');
    return jsonResponse(503, { error: 'Execution history unavailable.' });
  }
}

const RETRY_GRAPH_NODE_LIMIT = 50;

function triggerCategoryOf(nodes: Array<{ type: string; category: string }>): RetryTriggerCategory | null {
  const triggers = nodes.filter((node) => node.type === 'trigger');
  if (triggers.length !== 1) return null;
  const category = triggers[0].category;
  return category === 'manual_trigger' || category === 'webhook_trigger' || category === 'schedule_trigger' ? category : null;
}

async function loadGraph(workflowId: string) {
  const [nodes, savedConnections] = await Promise.all([
    db
      .select({ id: workflowNodes.id, type: workflowNodes.type, category: workflowNodes.category, label: workflowNodes.label, position: workflowNodes.position, config: workflowNodes.config })
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, workflowId)),
    db
      .select({ id: connections.id, sourceNodeId: connections.sourceNodeId, sourceHandle: connections.sourceHandle, targetNodeId: connections.targetNodeId, targetHandle: connections.targetHandle })
      .from(connections)
      .where(eq(connections.workflowId, workflowId)),
  ]);
  return { nodes, connections: savedConnections };
}

/**
 * POST /api/executions/:executionId/retry — replay one owned failed/interrupted run against the
 * workflow's current saved graph. Each run can be retried once (enforced in a single INSERT).
 */
export async function retryExecution(request: Request, context: { params: Record<string, string> }): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  if (!isSameOriginRequest(request)) return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  let newExecutionId: string | null = null;
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });
    const id = z.string().uuid().safeParse(context.params.executionId);
    if (!id.success) return jsonResponse(404, { error: 'Execution not found.' });

    const [original] = await db
      .select({ ...summaryFields, triggerData: executions.triggerData })
      .from(executions)
      .innerJoin(workflows, eq(workflows.id, executions.workflowId))
      .where(and(eq(executions.id, id.data), eq(workflows.ownerId, user.id)))
      .limit(1);
    if (!original) return jsonResponse(404, { error: 'Execution not found.' });
    const summary = toSummary(original as SummaryRow, new Date());

    const graph = workflowGraphSchema.safeParse(await loadGraph(original.workflowId));
    if (!graph.success) return jsonResponse(422, { error: 'Workflow graph is invalid. Review its node settings and connections.' });
    if (graph.data.nodes.length > RETRY_GRAPH_NODE_LIMIT) return jsonResponse(422, { error: 'A run is limited to 50 workflow nodes.' });
    const triggerCategory = triggerCategoryOf(graph.data.nodes);
    const plan = planRetry({ id: original.id, status: original.status, interrupted: summary.interrupted, trigger: summary.trigger, triggerData: original.triggerData }, triggerCategory);
    if (!plan.ok) return jsonResponse(plan.status, { error: plan.error });

    const inserted = await db.execute<{ id: string }>(sql`
      insert into ${executions} (workflow_id, status, trigger_data, started_at)
      select ${original.workflowId}::uuid, 'running'::execution_status, ${JSON.stringify(plan.triggerData)}::jsonb, now()
      where not exists (
        select 1 from ${executions} where ${executions.workflowId} = ${original.workflowId} and ${executions.triggerData}->>'retryOf' = ${original.id}
      )
      returning id
    `);
    const createdId = inserted.rows[0]?.id;
    if (!createdId) return jsonResponse(409, { error: 'This run was already retried.' });
    newExecutionId = createdId;

    if (summary.interrupted) {
      await getDbForSignal(createExecutionFinalizationSignal())
        .update(executions)
        .set({ status: 'failed', completedAt: new Date(), error: 'Run was interrupted before it finished.' })
        .where(and(eq(executions.id, original.id), inArray(executions.status, ['pending', 'running'])));
    }

    const sendEmail = createOwnerEmailNotifier(user.id);
    const result = await executeWorkflowGraph(graph.data, plan.triggerInput, {
      triggerCategory: triggerCategory!,
      resolveAIProvider: createOwnerAIProviderResolver(user.id, findOwnedAICredential),
      dataStore: createOwnerDataStore(user.id),
      ...(sendEmail ? { sendEmail } : {}),
    });
    const finalizationDb = getDbForSignal(createExecutionFinalizationSignal());
    if (result.logs.length > 0) {
      await finalizationDb.insert(executionLogs).values(result.logs.map((log) => ({
        executionId: createdId,
        nodeId: log.nodeId,
        status: log.status,
        inputData: log.inputData,
        outputData: log.outputData,
        error: log.error,
        timestamp: new Date(log.timestamp),
      })));
    }
    await finalizationDb
      .update(executions)
      .set({ status: result.status, completedAt: new Date(), error: result.error ?? null })
      .where(eq(executions.id, createdId));
    return jsonResponse(200, { execution: { id: createdId, status: result.status, error: result.error ?? null, retryOf: original.id } });
  } catch {
    if (newExecutionId) {
      try {
        await getDbForSignal(createExecutionFailureSignal()).update(executions).set({ status: 'failed', completedAt: new Date(), error: 'Execution persistence failed.' }).where(eq(executions.id, newExecutionId));
      } catch {
        // Database may be unavailable; never expose details.
      }
    }
    console.error('[executions.retry] Retry request failed.');
    return jsonResponse(503, { error: 'Workflow execution service unavailable.' });
  }
}
