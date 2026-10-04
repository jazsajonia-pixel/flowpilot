import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Clock3, Plus, Search, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createWorkflow, listWorkflows, WorkflowApiError, type WorkflowSummary } from '@/lib/workflow-api';

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Recently updated'
    : `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)}`;
}

export function WorkflowsPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let active = true;
    listWorkflows()
      .then((items) => {
        if (active) setWorkflows(items);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setNeedsLogin(reason instanceof WorkflowApiError && reason.status === 401);
        setError(reason instanceof Error ? reason.message : 'Could not load workflows.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredWorkflows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return workflows;
    return workflows.filter((workflow) =>
      `${workflow.title} ${workflow.description ?? ''}`.toLowerCase().includes(query),
    );
  }, [search, workflows]);

  async function handleCreate() {
    setIsCreating(true);
    setError(null);
    try {
      const workflow = await createWorkflow('Untitled workflow');
      navigate(`/workflows/${encodeURIComponent(workflow.id)}/edit`);
    } catch (reason) {
      setNeedsLogin(reason instanceof WorkflowApiError && reason.status === 401);
      setError(reason instanceof Error ? reason.message : 'Could not create a workflow.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Workflows</h2>
          <p className="text-sm text-muted-foreground">Design and manage your visual automation graphs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/workflow-preview')}>
            Preview the builder
          </Button>
          <Button type="button" className="gap-2" onClick={handleCreate} disabled={isCreating}>
            <Plus className="h-4 w-4" />
            {isCreating ? 'Creating…' : 'Create workflow'}
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="Search workflows"
          placeholder="Search workflows…"
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{needsLogin ? 'Sign in to load and save your workflows.' : error}</span>
          {needsLogin && <Link className="font-semibold underline" to="/login">Sign in</Link>}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All workflows</CardTitle>
          <CardDescription>Your saved workflow canvas definitions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground" role="status">
              Loading workflows…
            </div>
          ) : filteredWorkflows.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredWorkflows.map((workflow) => (
                <Link
                  key={workflow.id}
                  to={`/workflows/${encodeURIComponent(workflow.id)}/edit`}
                  className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Workflow className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 truncate text-sm font-semibold">{workflow.title}</h3>
                  <p className="mt-1 min-h-9 line-clamp-2 text-xs text-muted-foreground">
                    {workflow.description || 'No description yet'}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${workflow.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {workflow.isActive ? 'Active' : 'Draft'}
                    </span>
                    <span className="inline-flex items-center gap-1 truncate">
                      <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {formatUpdatedAt(workflow.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Workflow className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {search ? 'No matching workflows' : 'No workflows yet'}
              </h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                {search
                  ? 'Try a different search, or clear the search box.'
                  : 'Create your first workflow to start connecting triggers, AI, logic, and actions.'}
              </p>
              {!search && !error && (
                <Button className="mt-5 gap-2" size="sm" onClick={handleCreate} disabled={isCreating}>
                  <Plus className="h-4 w-4" />
                  {isCreating ? 'Creating…' : 'Create your first workflow'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
