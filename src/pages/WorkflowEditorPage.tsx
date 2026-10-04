import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ReactFlowProvider,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { ArrowLeft, Check, CircleAlert, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas';
import type { FlowEdge, FlowNode } from '@/components/workflow/flow-types';
import { toFlowEdge, toFlowNode, toWorkflowConnection, toWorkflowNode } from '@/components/workflow/graph-mapping';
import { getWorkflow, getWorkflowGraph, saveWorkflowGraph, updateWorkflowTitle, WorkflowApiError, type WorkflowGraph, type WorkflowSummary } from '@/lib/workflow-api';
import { demoWorkflow, demoWorkflowGraph } from '@/lib/workflow-demo';
import { isWorkflowConnectionAllowed } from '@/lib/workflow-graph';
import type { WorkflowNodeDefinition } from '@/types/workflow';

interface WorkflowEditorPageProps {
  demo?: boolean;
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

const blankGraph: WorkflowGraph = { nodes: [], connections: [] };

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The workflow could not be saved. Please try again.';
}

export function WorkflowEditorPage({ demo = false }: WorkflowEditorPageProps) {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<WorkflowSummary | null>(null);
  const [title, setTitle] = useState('');
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [graphLoaded, setGraphLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTitleSaving, setIsTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const graphSnapshotRef = useRef<WorkflowGraph>(blankGraph);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    setNeedsLogin(false);
    setGraphLoaded(false);
    setWorkflow(null);
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSaveState('saved');
    setSaveError(null);
    setTitleError(null);
    setRevision(0);
    revisionRef.current = 0;
    savedRevisionRef.current = 0;
    graphSnapshotRef.current = blankGraph;
    saveQueueRef.current = Promise.resolve();

    if (demo) {
      setWorkflow(demoWorkflow);
      setTitle(demoWorkflow.title);
      setNodes(demoWorkflowGraph.nodes.map(toFlowNode));
      setEdges(demoWorkflowGraph.connections.map(toFlowEdge));
      setSelectedNodeId(demoWorkflowGraph.nodes[0]?.id ?? null);
      graphSnapshotRef.current = demoWorkflowGraph;
      setGraphLoaded(true);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    if (!workflowId) {
      setLoadError('Workflow not found.');
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    Promise.all([getWorkflow(workflowId), getWorkflowGraph(workflowId)])
      .then(([loadedWorkflow, graph]) => {
        if (!active) return;
        setWorkflow(loadedWorkflow);
        setTitle(loadedWorkflow.title);
        setNodes(graph.nodes.map(toFlowNode));
        setEdges(graph.connections.map(toFlowEdge));
        graphSnapshotRef.current = graph;
        setGraphLoaded(true);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setNeedsLogin(reason instanceof WorkflowApiError && reason.status === 401);
        setLoadError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [demo, workflowId]);

  useEffect(() => {
    graphSnapshotRef.current = {
      nodes: nodes.map(toWorkflowNode),
      connections: edges.map(toWorkflowConnection),
    };
  }, [nodes, edges]);

  const markGraphChanged = useCallback(() => {
    if (demo) return;
    revisionRef.current += 1;
    setRevision(revisionRef.current);
    setSaveState('unsaved');
    setSaveError(null);
  }, [demo]);

  const enqueueGraphSave = useCallback((): Promise<void> => {
    if (demo || !workflowId) return Promise.resolve();

    const task = saveQueueRef.current.catch(() => undefined).then(async () => {
      const version = revisionRef.current;
      if (version <= savedRevisionRef.current) return;
      const snapshot = graphSnapshotRef.current;
      setSaveState('saving');
      setSaveError(null);
      try {
        await saveWorkflowGraph(workflowId, snapshot);
        savedRevisionRef.current = version;
        if (version === revisionRef.current) setSaveState('saved');
      } catch (reason) {
        if (version === revisionRef.current) {
          setSaveState('error');
          setSaveError(errorMessage(reason));
        }
        throw reason;
      }
    });
    saveQueueRef.current = task;
    return task;
  }, [demo, workflowId]);

  const saveGraphNow = useCallback((): Promise<void> => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return enqueueGraphSave();
  }, [enqueueGraphSave]);

  useEffect(() => {
    if (demo || !workflowId || !graphLoaded || revision === 0 || revision <= savedRevisionRef.current) return;
    const timer = window.setTimeout(() => {
      saveTimerRef.current = null;
      void enqueueGraphSave().catch(() => undefined);
    }, 700);
    saveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (saveTimerRef.current === timer) saveTimerRef.current = null;
    };
  }, [demo, workflowId, graphLoaded, revision, enqueueGraphSave]);

  async function persistTitle() {
    if (demo || !workflowId || !workflow) return;
    const normalized = title.trim();
    if (!normalized) {
      setTitleError('Workflow name cannot be empty.');
      return;
    }
    if (normalized === workflow.title) return;

    setIsTitleSaving(true);
    setTitleError(null);
    try {
      const updated = await updateWorkflowTitle(workflowId, normalized);
      setWorkflow(updated);
      setTitle(updated.title);
    } catch (reason) {
      setTitleError(errorMessage(reason));
    } finally {
      setIsTitleSaving(false);
    }
  }

  async function handleBack() {
    if (!demo && revisionRef.current > savedRevisionRef.current) {
      try {
        await saveGraphNow();
      } catch {
        return;
      }
    }
    navigate('/workflows');
  }

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      setNodes((current) => applyNodeChanges<FlowNode>(changes, current));
      const removedIds = changes.filter((change) => change.type === 'remove').map((change) => change.id);
      if (removedIds.length > 0) {
        const removed = new Set(removedIds);
        setEdges((current) => current.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)));
        setSelectedNodeId((current) => (current && removed.has(current) ? null : current));
      }
      if (changes.some((change) => change.type !== 'select' && change.type !== 'dimensions')) markGraphChanged();
    },
    [markGraphChanged],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      setEdges((current) => applyEdgeChanges<FlowEdge>(changes, current));
      if (changes.some((change) => change.type !== 'select')) markGraphChanged();
    },
    [markGraphChanged],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const nodeRefs = nodes.map((node) => ({ id: node.id, type: node.data.nodeType, category: node.data.category }));
      const edgeRefs = edges.map(toWorkflowConnection);
      if (!isWorkflowConnectionAllowed(connection.source, connection.target, nodeRefs, edgeRefs)) return;
      if (!connection.source || !connection.target) return;
      setEdges((current) =>
        addEdge<FlowEdge>(
          {
            id: crypto.randomUUID(),
            source: connection.source,
            sourceHandle: connection.sourceHandle,
            target: connection.target,
            targetHandle: connection.targetHandle,
            type: 'smoothstep',
          },
          current,
        ),
      );
      markGraphChanged();
    },
    [edges, markGraphChanged, nodes],
  );

  const handleAddNode = useCallback(
    (definition: WorkflowNodeDefinition, position: { x: number; y: number }) => {
      if (definition.type === 'trigger' && nodes.some((node) => node.data.nodeType === 'trigger')) return;
      const node: FlowNode = {
        id: crypto.randomUUID(),
        type: 'workflowNode',
        position,
        data: {
          nodeType: definition.type,
          category: definition.category,
          label: definition.label,
          config: {},
        },
      };
      setNodes((current) => [...current, node]);
      setSelectedNodeId(node.id);
      markGraphChanged();
    },
    [markGraphChanged, nodes],
  );

  const handleUpdateNodeLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, label } } : node)),
      );
      markGraphChanged();
    },
    [markGraphChanged],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNodeId(null);
      markGraphChanged();
    },
    [markGraphChanged],
  );

  const hasUnsavedGraph = revision > savedRevisionRef.current;
  const saveLabel = demo
    ? 'Preview only'
    : saveState === 'saving'
      ? 'Saving…'
      : saveState === 'unsaved'
        ? 'Unsaved changes'
        : saveState === 'error'
          ? 'Save failed'
          : 'All changes saved';

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading workflow…</main>;
  }

  if (loadError || !workflow) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-lg rounded-xl border bg-card p-6 text-center shadow-sm">
          <CircleAlert className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold">Could not open this workflow</h1>
          <p className="mt-2 text-sm text-muted-foreground">{needsLogin ? 'Sign in to load and edit this workflow.' : loadError}</p>
          <div className="mt-5 flex justify-center gap-2">
            {needsLogin && <Button onClick={() => navigate('/login')}>Sign in</Button>}
            <Button variant="outline" onClick={() => navigate('/workflows')}>Back to workflows</Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground lg:h-screen lg:min-h-[640px] lg:overflow-hidden">
      <header className="z-20 flex min-h-16 shrink-0 items-center gap-3 border-b bg-card px-3 shadow-sm sm:px-5">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Back to workflows" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="hidden shrink-0 sm:block">
          <span className="text-xs font-bold tracking-[0.14em] text-primary">FLOWPILOT</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">WORKFLOW BUILDER</span>
        </div>
        <div className="mx-1 h-8 w-px shrink-0 bg-border" />
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Workflow name"
            className="h-9 max-w-md border-transparent bg-transparent px-2 text-sm font-semibold shadow-none focus-visible:border-input"
            value={title}
            maxLength={200}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleError(null);
            }}
            onBlur={() => void persistTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            disabled={demo ? false : isTitleSaving}
          />
          {titleError && <p className="px-2 text-[10px] text-destructive" role="alert">{titleError}</p>}
        </div>
        {demo ? (
          <span className="hidden rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-900 sm:inline-flex">Interactive preview · not saved</span>
        ) : (
          <span className={`hidden items-center gap-1.5 text-xs sm:inline-flex ${saveState === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} role="status">
            {saveState === 'saved' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <span className={`h-2 w-2 rounded-full ${saveState === 'saving' ? 'animate-pulse bg-primary' : 'bg-amber-500'}`} />}
            {saveLabel}
          </span>
        )}
        {!demo && (
          <Button
            type="button"
            size="sm"
            className="shrink-0 gap-2"
            disabled={!hasUnsavedGraph || saveState === 'saving'}
            onClick={() => void saveGraphNow().catch(() => undefined)}
          >
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        )}
      </header>

      {demo && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950">
          Sample preview mode. Move nodes, connect them, or rename one to try the editor; your changes are not saved.
        </div>
      )}
      {saveError && !demo && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive" role="alert">
          <span>{saveError}</span>
          <Button size="sm" variant="outline" onClick={() => void saveGraphNow().catch(() => undefined)}>Retry save</Button>
        </div>
      )}

      <ReactFlowProvider>
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onSelectNode={setSelectedNodeId}
          onAddNode={handleAddNode}
          onUpdateNodeLabel={handleUpdateNodeLabel}
          onDeleteNode={handleDeleteNode}
        />
      </ReactFlowProvider>
      <footer className="flex shrink-0 items-center justify-between border-t bg-card px-4 py-2 text-[10px] text-muted-foreground">
        <span>Drag from a handle to connect. Cycles and connections into triggers are blocked.</span>
        <Link to="/workflows" className="hidden font-medium text-primary hover:underline sm:inline">All workflows</Link>
        {!demo && <span className="sm:hidden">{saveLabel}</span>}
      </footer>
    </main>
  );
}
