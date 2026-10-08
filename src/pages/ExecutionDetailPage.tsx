import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleSlash, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExecutionStatusBadge } from '@/components/executions/ExecutionStatusBadge';
import { formatDuration, getExecutionDetail, retryExecutionRun, TRIGGER_LABELS, type ExecutionDetail } from '@/lib/execution-api';

const stepIcon = { success: CheckCircle2, error: XCircle, skipped: CircleSlash } as const;
const stepColor = { success: 'text-emerald-600', error: 'text-destructive', skipped: 'text-muted-foreground' } as const;

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  return <pre className="mt-2 max-h-56 overflow-auto rounded bg-muted/50 p-2 text-[11px] leading-4">{JSON.stringify(value, null, 2)}</pre>;
}

export function ExecutionDetailPage() {
  const { executionId = '' } = useParams();
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const next = await retryExecutionRun(executionId);
      navigate(`/executions/${next.id}`);
    } catch (reason) {
      setRetryError(reason instanceof Error ? reason.message : 'Retry failed.');
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    setExecution(null);
    setError(null);
    setRetryError(null);
    getExecutionDetail(executionId).then(setExecution).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Run could not be loaded.'));
  }, [executionId]);

  return (
    <div className="space-y-6">
      <Link to="/executions"><Button variant="ghost" size="sm" className="gap-2 px-2"><ArrowLeft className="h-4 w-4" /> All runs</Button></Link>
      {error && <p className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive" role="alert">{error}</p>}
      {!execution && !error && <p className="text-sm text-muted-foreground">Loading run…</p>}
      {execution && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{execution.workflowTitle}</CardTitle>
                <ExecutionStatusBadge item={execution} />
              </div>
              <CardDescription className="font-mono text-[11px]">{execution.id}</CardDescription>
              {(execution.status === 'failed' || execution.interrupted) && (
                <div className="space-y-1.5 pt-2">
                  <Button size="sm" className="gap-2" disabled={!execution.retry.allowed || retrying} onClick={() => void retry()}>
                    <RotateCcw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} /> {retrying ? 'Retrying…' : 'Retry run'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    {execution.retry.allowed ? "Runs again with the workflow's current saved steps." : execution.retry.reason}
                  </p>
                  {retryError && <p className="text-[11px] text-destructive" role="alert">{retryError}</p>}
                </div>
              )}
              {execution.retryOf && <p className="pt-1 text-[11px]"><Link className="text-primary underline" to={`/executions/${execution.retryOf}`}>Retry of an earlier run</Link></p>}
              {execution.retriedBy && <p className="pt-1 text-[11px]"><Link className="text-primary underline" to={`/executions/${execution.retriedBy}`}>View the retry</Link></p>}
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><p className="text-muted-foreground">Trigger</p><p className="font-medium">{TRIGGER_LABELS[execution.trigger]}</p></div>
              <div><p className="text-muted-foreground">Started</p><p className="font-medium">{new Date(execution.startedAt ?? execution.createdAt).toLocaleString()}</p></div>
              <div><p className="text-muted-foreground">Duration</p><p className="font-medium">{formatDuration(execution.durationMs)}</p></div>
              <div><p className="text-muted-foreground">Steps</p><p className="font-medium">{execution.steps.succeeded} ok · {execution.steps.failed} failed · {execution.steps.skipped} skipped</p></div>
              {execution.scheduledAt && <div className="col-span-2"><p className="text-muted-foreground">Scheduled for</p><p className="font-medium">{new Date(execution.scheduledAt).toLocaleString()}</p></div>}
              {execution.error && <div className="col-span-2 sm:col-span-4"><p className="text-muted-foreground">Error</p><p className="font-medium text-destructive">{execution.error}</p></div>}
              {execution.interrupted && <p className="col-span-2 text-muted-foreground sm:col-span-4">This run never finished, likely because the server stopped mid-run. It will not resume.</p>}
              <div className="col-span-2 sm:col-span-4"><p className="text-muted-foreground">Trigger input (summary)</p><Json value={execution.triggerData} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Steps</CardTitle>
              <CardDescription>In the order they ran. Outputs are stored as safe summaries only.</CardDescription>
            </CardHeader>
            <CardContent>
              {execution.logs.length === 0 && <p className="text-xs text-muted-foreground">No steps were recorded.</p>}
              <ol className="space-y-3">
                {execution.logs.map((log, index) => {
                  const Icon = stepIcon[log.status];
                  return (
                    <li key={`${log.nodeId}-${index}`} className="rounded-lg border p-3">
                      <div className="flex items-start gap-2">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${stepColor[log.status]}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{index + 1}. {log.label}{!log.nodeExists && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(deleted step)</span>}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()} · {log.status}</p>
                          {log.error && <p className="mt-1 text-xs text-destructive">{log.error}</p>}
                          <Json value={log.outputData} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
