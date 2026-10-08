import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { executionLogs, executions, workflowNodes, workflows } from '../../db/schema';
import { getRequestUser } from '../../server/auth/request-user';
import { jsonResponse } from '../../server/auth/http';
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
  triggerCategory: triggerCategorySql,
  succeeded: stepCountSql('success'),
  failed: stepCountSql('error'),
  skipped: stepCountSql('skipped'),
};

type SummaryRow = {
  id: string; workflowId: string; workflowTitle: string; status: string; error: string | null;
  createdAt: Date; startedAt: Date | null; completedAt: Date | null; scheduledAt: Date | null;
  triggerCategory: string | null; succeeded: number; failed: number; skipped: number;
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
    return jsonResponse(200, {
      execution: {
        ...toSummary(row as SummaryRow, new Date()),
        triggerData: row.triggerData ?? null,
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
