import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  Plus,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listExecutionHistory, type ExecutionHistoryItem } from '@/lib/execution-api';
import { listWorkflows, type WorkflowSummary } from '@/lib/workflow-api';

function formatRelativeDate(value: string | null): string {
  if (!value) return 'Not started';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

const statusTone: Record<ExecutionHistoryItem['status'], string> = {
  completed: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25',
  failed: 'bg-rose-500/10 text-rose-300 ring-rose-400/25',
  running: 'bg-brand-500/10 text-brand-300 ring-brand-400/25',
  pending: 'bg-amber-500/10 text-amber-300 ring-amber-400/25',
};

export function DashboardPage() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [executions, setExecutions] = useState<ExecutionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listWorkflows(), listExecutionHistory({})])
      .then(([workflowItems, history]) => {
        if (!active) return;
        setWorkflows(workflowItems);
        setExecutions(history.executions);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : 'Dashboard data is unavailable.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const recentRuns = useMemo(() => executions.slice(0, 5), [executions]);
  const completedRuns = executions.filter((run) => run.status === 'completed' || run.status === 'failed');
  const successRate = completedRuns.length
    ? `${Math.round((completedRuns.filter((run) => run.status === 'completed').length / completedRuns.length) * 100)}%`
    : '—';
  const activeWorkflows = workflows.filter((workflow) => workflow.isActive).length;
  const latestRun = executions[0];

  const stats = [
    { label: 'Workflows', value: isLoading ? '…' : String(workflows.length), note: `${activeWorkflows} active`, icon: Workflow, tone: 'violet' },
    { label: 'Active automations', value: isLoading ? '…' : String(activeWorkflows), note: 'Triggers listening', icon: Zap, tone: 'amber' },
    { label: 'Recent runs', value: isLoading ? '…' : String(executions.length), note: 'Latest history page', icon: Activity, tone: 'sky' },
    { label: 'Recent success rate', value: isLoading ? '…' : successRate, note: `${completedRuns.length} finished runs sampled`, icon: CheckCircle2, tone: 'emerald' },
  ] as const;
  const statTone: Record<string, string> = {
    violet: 'bg-brand-500/10 text-brand-300 ring-brand-400/25',
    amber: 'bg-amber-500/10 text-amber-300 ring-amber-400/25',
    sky: 'bg-sky-500/10 text-sky-300 ring-sky-400/25',
    emerald: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25',
  };

  return (
    <div className="space-y-7 flowpilot-stagger">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-brand-400/25 bg-gradient-to-br from-[#14224d] via-card to-[#0b2530] px-6 py-7 shadow-sm shadow-brand-950/[0.03] sm:px-9 sm:py-9">
        <div className="pointer-events-none absolute -right-12 -top-24 -z-10 h-72 w-72 rounded-full bg-brand-300/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-75px] right-[24%] -z-10 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-card/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-300 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" /> Automation workspace
            </div>
            <h2 className="max-w-xl text-[28px] font-semibold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[36px]">Let the busywork run itself.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-[15px]">Connect a trigger, add a little AI, and send work where it needs to go. Your automations stay visible from first step to final result.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/workflows"><Button className="h-10 gap-2 rounded-xl px-4 shadow-md shadow-brand-500/20"><Plus className="h-4 w-4" /> Build a workflow</Button></Link>
              <Link to="/workflow-preview"><Button variant="outline" className="h-10 gap-2 rounded-xl border-border bg-card/70 px-4">Explore the canvas <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
            </div>
          </div>
          <div className="hidden rounded-[22px] border border-border bg-card/70 p-4 shadow-xl shadow-brand-950/[0.06] backdrop-blur-md lg:block">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">Latest activity</p><p className="mt-1 text-sm font-semibold text-foreground">{latestRun?.workflowTitle ?? 'Your first run'}</p></div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Activity className="h-4 w-4" /></span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${latestRun?.status === 'failed' || latestRun?.interrupted ? 'bg-rose-500/10 text-rose-300' : latestRun?.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-brand-500/10 text-brand-300'}`}>
                {latestRun?.status === 'failed' || latestRun?.interrupted
                  ? <AlertCircle className="h-4 w-4" />
                  : latestRun?.status === 'completed'
                    ? <CheckCircle2 className="h-4 w-4" />
                    : <Activity className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-foreground">{latestRun ? latestRun.interrupted ? 'Run interrupted' : latestRun.status === 'completed' ? 'Run completed' : latestRun.status === 'failed' ? 'Run needs attention' : latestRun.status === 'pending' ? 'Run queued' : 'Run in progress' : 'Ready when you are'}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{latestRun ? formatRelativeDate(latestRun.createdAt) : 'A trigger starts the flow'}</p></div>
              {latestRun && <span className={`h-2 w-2 rounded-full ${latestRun.status === 'completed' ? 'bg-emerald-400' : latestRun.status === 'failed' || latestRun.interrupted ? 'bg-rose-400' : latestRun.status === 'pending' ? 'bg-amber-400' : 'bg-brand-400'}`} aria-label={`Status: ${latestRun.status}`} />}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted-foreground">
              <span>Execution status</span>
              <span className={`rounded-full px-2 py-1 font-semibold capitalize ${latestRun ? statusTone[latestRun.status] : 'bg-secondary text-muted-foreground'}`}>{latestRun ? latestRun.interrupted ? 'Interrupted' : latestRun.status : 'No runs yet'}</span>
            </div>
          </div>
        </div>
      </section>

      {loadError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100" role="status"><span>Workspace data could not be loaded. Check your session and API connection, then refresh to try again.</span><Link to="/login" className="font-semibold underline underline-offset-2">Sign in</Link></div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace metrics">
        {stats.map((stat) => (
          <article key={stat.label} className="group flowpilot-interactive-card rounded-2xl border border-border bg-card p-4 shadow-sm shadow-slate-950/[0.025] sm:p-5">
            <div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-muted-foreground">{stat.label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${statTone[stat.tone]}`}><stat.icon className="flowpilot-icon-hover h-4 w-4" /></span></div>
            <div className="mt-3 flex items-end justify-between gap-3"><p className="text-[27px] font-semibold leading-none tracking-tight text-foreground">{stat.value}</p><p className="text-right text-[10px] text-muted-foreground">{stat.note}</p></div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="overflow-hidden rounded-[22px] border border-border bg-card shadow-sm shadow-slate-950/[0.025]">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div><h3 className="text-sm font-semibold text-foreground">Your workflows</h3><p className="mt-1 text-xs text-muted-foreground">A quick look at what you’ve been building</p></div>
            <Link to="/workflows" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200">View all <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </header>
          <div className="p-4 sm:p-5">
            {isLoading ? <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">Loading workflows…</div> : workflows.length ? (
              <div className="space-y-2">
                {workflows.slice(0, 4).map((workflow, index) => (
                  <Link key={workflow.id} to={`/workflows/${encodeURIComponent(workflow.id)}/edit`} className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-all hover:border-brand-400/40 hover:bg-brand-500/10">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index % 2 === 0 ? 'bg-brand-500/10 text-brand-300' : 'bg-sky-500/10 text-sky-300'}`}><Workflow className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{workflow.title}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{workflow.description || 'No description yet'}</span></span>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-semibold ${workflow.isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-secondary text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${workflow.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />{workflow.isActive ? 'Active' : 'Draft'}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-300" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 p-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300"><Workflow className="h-5 w-5" /></span>
                <p className="mt-3 text-sm font-semibold text-foreground">Start with one small win</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Choose a trigger, drop in a step, and watch your first routine run itself.</p>
                <Link to="/workflows" className="mt-4"><Button size="sm" className="h-8 gap-1.5 rounded-lg"><Plus className="h-3.5 w-3.5" /> Create workflow</Button></Link>
              </div>
            )}
          </div>
        </article>

        <article className="overflow-hidden rounded-[22px] border border-border bg-card shadow-sm shadow-slate-950/[0.025]">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div><h3 className="text-sm font-semibold text-foreground">Recent runs</h3><p className="mt-1 text-xs text-muted-foreground">See what happened, step by step</p></div>
            <Link to="/executions" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200">Run history <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </header>
          <div className="p-4 sm:p-5">
            {isLoading ? <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">Loading run history…</div> : recentRuns.length ? (
              <div className="space-y-1">
                {recentRuns.map((run) => (
                  <Link key={run.id} to={`/executions/${encodeURIComponent(run.id)}`} className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/50">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${run.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300' : run.status === 'failed' ? 'bg-rose-500/10 text-rose-300' : 'bg-brand-500/10 text-brand-300'}`}><Activity className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{run.workflowTitle}</span><span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="h-3 w-3" />{formatRelativeDate(run.createdAt)}</span></span>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-semibold capitalize ring-1 ring-inset ${statusTone[run.status]}`}>{run.interrupted ? 'Interrupted' : run.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 p-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300"><Activity className="h-5 w-5" /></span>
                <p className="mt-3 text-sm font-semibold text-foreground">Nothing has run yet</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Add a Manual Trigger to a workflow and run it with sample data.</p>
                <Link to="/workflows" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200">Open workflows <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-[22px] border border-border bg-card p-5 shadow-sm shadow-slate-950/[0.025] sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-300"><Sparkles className="h-3.5 w-3.5" />A simple way to start</div><h3 className="mt-2 text-base font-semibold text-foreground">From idea to automation in three steps</h3></div><Link to="/integrations" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200">Explore connections <ArrowRight className="h-3.5 w-3.5" /></Link></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            { icon: Zap, title: 'Choose a starting point', body: 'Start manually, accept a webhook, or set a daily schedule.', color: 'bg-amber-500/10 text-amber-300' },
            { icon: Bot, title: 'Give it a smart step', body: 'Use Gemini to draft, classify, extract, or summarize information.', color: 'bg-brand-500/10 text-brand-300' },
            { icon: ArrowRight, title: 'Send work onward', body: 'Call public HTTPS APIs, send your account a notice, or save private records.', color: 'bg-emerald-500/10 text-emerald-300' },
          ].map((step, index) => (
            <div key={step.title} className="flex gap-3 rounded-2xl border border-border bg-muted/50 p-4">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${step.color}`}><step.icon className="h-4 w-4" /></span>
              <div><p className="text-xs font-semibold text-foreground"><span className="mr-1.5 text-[10px] text-muted-foreground/70">0{index + 1}</span>{step.title}</p><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{step.body}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
