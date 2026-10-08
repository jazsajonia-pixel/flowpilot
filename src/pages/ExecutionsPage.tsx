import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExecutionStatusBadge } from '@/components/executions/ExecutionStatusBadge';
import { formatDuration, listExecutionHistory, TRIGGER_LABELS, type ExecutionHistoryItem, type ExecutionStatus } from '@/lib/execution-api';
import { listWorkflows, type WorkflowSummary } from '@/lib/workflow-api';

const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm';

export function ExecutionsPage() {
  const [items, setItems] = useState<ExecutionHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [status, setStatus] = useState<ExecutionStatus | ''>('');
  const [workflowId, setWorkflowId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listExecutionHistory({ ...(status ? { status } : {}), ...(workflowId ? { workflowId } : {}), ...(cursor ? { cursor } : {}) });
      setItems((current) => (cursor ? [...current, ...page.executions] : page.executions));
      setNextCursor(page.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Execution history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [status, workflowId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { listWorkflows().then(setWorkflows).catch(() => setWorkflows([])); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Execution History</h2>
          <p className="text-sm text-muted-foreground">Every manual, webhook, and scheduled run, with step-by-step logs.</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select aria-label="Filter by status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as ExecutionStatus | '')}>
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
        </select>
        <select aria-label="Filter by workflow" className={`${selectClass} max-w-full`} value={workflowId} onChange={(event) => setWorkflowId(event.target.value)}>
          <option value="">All workflows</option>
          {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.title}</option>)}
        </select>
      </div>

      {error && <p className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive" role="alert">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runs</CardTitle>
          <CardDescription>Newest first. Tap a run to see each step.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!loading && items.length === 0 && !error && (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Activity className="h-6 w-6" /></div>
              <h3 className="text-base font-semibold text-foreground">No runs found</h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Run a workflow manually, via webhook, or on a schedule, or change the filters.</p>
            </div>
          )}
          {items.map((item) => (
            <Link key={item.id} to={`/executions/${item.id}`} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{item.workflowTitle}</span>
                  <ExecutionStatusBadge item={item} />
                  {item.retryOf && <span className="rounded border px-1.5 text-[10px] text-muted-foreground">Retry</span>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {TRIGGER_LABELS[item.trigger]} · {new Date(item.createdAt).toLocaleString()} · {formatDuration(item.durationMs)} · {item.steps.succeeded} ok{item.steps.failed ? `, ${item.steps.failed} failed` : ''}{item.steps.skipped ? `, ${item.steps.skipped} skipped` : ''}
                </p>
                {item.error && <p className="truncate text-[11px] text-destructive">{item.error}</p>}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
          {nextCursor && (
            <Button variant="outline" size="sm" className="w-full" disabled={loading} onClick={() => void load(nextCursor)}>Load more</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
