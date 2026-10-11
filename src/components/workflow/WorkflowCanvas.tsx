import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { ArrowUpRight, GitBranch, GripVertical, Plus, Search, Sparkles, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NodeConfigurationEditor } from './NodeConfigurationEditor';
import { NODE_CATALOG, type NodeType, type WorkflowNodeDefinition } from '@/types/workflow';
import { isWorkflowConnectionAllowed } from '@/lib/workflow-graph';
import { toWorkflowConnection } from './graph-mapping';
import type { FlowEdge, FlowNode } from './flow-types';
import { WorkflowNodeCard } from './WorkflowNodeCard';
import type { AICredentialSummary } from '@/types/ai';

interface WorkflowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  aiCredentials?: AICredentialSummary[];
  isExecuting?: boolean;
  readOnly?: boolean;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  onSelectNode: (nodeId: string | null) => void;
  onAddNode: (definition: WorkflowNodeDefinition, position: { x: number; y: number }) => void;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
  onUpdateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
}

const nodeTypes: NodeTypes = { workflowNode: WorkflowNodeCard };
const groupStyle: Record<NodeType, { label: string; icon: typeof Zap; className: string }> = {
  trigger: { label: 'Triggers', icon: Zap, className: 'text-amber-700' },
  ai: { label: 'AI', icon: Sparkles, className: 'text-violet-700' },
  logic: { label: 'Logic', icon: GitBranch, className: 'text-sky-700' },
  action: { label: 'Actions', icon: ArrowUpRight, className: 'text-emerald-700' },
};
const nodeTypeOrder: NodeType[] = ['trigger', 'ai', 'logic', 'action'];

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  const flowContainerRef = useRef<HTMLDivElement>(null);
  const [nodeQuery, setNodeQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const { screenToFlowPosition } = useReactFlow<FlowNode, FlowEdge>();
  const selectedNode = props.nodes.find((node) => node.id === props.selectedNodeId) ?? null;
  const graphNodes = useMemo(
    () => props.nodes.map((node) => ({ id: node.id, type: node.data.nodeType, category: node.data.category })),
    [props.nodes],
  );
  const graphEdges = useMemo(() => props.edges.map(toWorkflowConnection), [props.edges]);
  const isValidConnection = useCallback(
    (connection: Connection | FlowEdge) =>
      isWorkflowConnectionAllowed(connection.source, connection.target, graphNodes, graphEdges, connection.sourceHandle, connection.targetHandle),
    [graphNodes, graphEdges],
  );
  const hasTrigger = props.nodes.some((node) => node.data.nodeType === 'trigger');

  const addAtCenter = useCallback(
    (definition: WorkflowNodeDefinition) => {
      const bounds = flowContainerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      props.onAddNode(
        definition,
        screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }),
      );
    },
    [props, screenToFlowPosition],
  );

  const onDragStart = (event: DragEvent<HTMLButtonElement>, definition: WorkflowNodeDefinition) => {
    event.dataTransfer.setData('application/flowpilot-node', definition.category);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const category = event.dataTransfer.getData('application/flowpilot-node');
    const definition = NODE_CATALOG.find((candidate) => candidate.category === category);
    if (!definition || (definition.type === 'trigger' && hasTrigger)) return;
    props.onAddNode(definition, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="flex max-h-44 shrink-0 gap-2 overflow-x-auto border-b bg-white p-3 lg:max-h-none lg:w-[264px] lg:flex-col lg:gap-0 lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r lg:p-4">
        <div className="hidden pb-3 lg:block">
          <div className="flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-800">Step library</h2><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{NODE_CATALOG.length}</span></div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">Drag onto the canvas, or select to add.</p>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <Input value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} placeholder="Find a step…" aria-label="Search workflow steps" className="h-9 rounded-lg border-slate-200 bg-slate-50 pl-8 text-xs focus:bg-white" />
          </label>
        </div>
        {nodeTypeOrder.map((type) => {
          const group = groupStyle[type];
          const GroupIcon = group.icon;
          const definitions = NODE_CATALOG.filter((item) => item.type === type && `${item.label} ${item.description}`.toLowerCase().includes(nodeQuery.trim().toLowerCase()));
          if (definitions.length === 0) return null;
          return (
            <section key={type} className="min-w-52 lg:mb-4 lg:min-w-0">
              <h3 className={`mb-1.5 flex items-center gap-2 px-1 text-[9px] font-bold uppercase tracking-[0.13em] ${group.className}`}>
                <GroupIcon className="h-3 w-3" aria-hidden="true" /> {group.label}
              </h3>
              <div className="flex gap-2 lg:flex-col">
                {definitions.map((definition) => {
                  const disabled = props.readOnly || (definition.type === 'trigger' && hasTrigger);
                  return (
                    <button
                      key={definition.category}
                      type="button"
                      draggable={!disabled}
                      disabled={disabled}
                      onDragStart={(event) => onDragStart(event, definition)}
                      onClick={() => addAtCenter(definition)}
                      className="group flex min-w-44 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 text-left transition-all duration-150 hover:-translate-y-px hover:border-violet-200 hover:bg-violet-50/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-45 lg:min-w-0"
                      title={definition.description}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${type === 'trigger' ? 'bg-amber-50 text-amber-600' : type === 'ai' ? 'bg-violet-50 text-violet-600' : type === 'logic' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600'}`}><GroupIcon className="h-3.5 w-3.5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-slate-800">{definition.label}</span><span className="mt-0.5 hidden truncate text-[9px] leading-4 text-slate-500 lg:block">{definition.description}</span></span>
                      <GripVertical className="hidden h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-violet-400 lg:block" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {nodeQuery && !NODE_CATALOG.some((item) => `${item.label} ${item.description}`.toLowerCase().includes(nodeQuery.trim().toLowerCase())) && <p className="hidden rounded-xl border border-dashed border-slate-200 p-3 text-center text-[10px] text-slate-500 lg:block">No steps match that search.</p>}
        {hasTrigger && <p className="hidden rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800 lg:block">This workflow already has a trigger.</p>}
      </aside>

      <div
        ref={flowContainerRef}
        className={`relative min-h-[55vh] min-w-0 flex-1 bg-[#f8f9fd] transition-colors duration-200 lg:min-h-0 ${isDragOver ? 'flowpilot-drop-active' : ''} ${props.isExecuting ? 'flowpilot-flow-running' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!nextTarget || !event.currentTarget.contains(nextTarget)) setIsDragOver(false);
        }}
        onDrop={onDrop}
      >
        {isDragOver && <div className="pointer-events-none absolute inset-x-0 top-4 z-20 mx-auto w-fit rounded-full border border-violet-200 bg-white/90 px-4 py-2 text-[11px] font-semibold text-violet-700 shadow-lg shadow-violet-950/10">Release to add this step</div>}
        {props.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-x-4 top-5 z-10 mx-auto max-w-md rounded-xl border bg-white/90 p-4 text-center shadow-sm">
            <p className="text-sm font-semibold">Start with a trigger</p>
            <p className="mt-1 text-xs text-muted-foreground">Drag a node from the library or tap a node to place it here.</p>
          </div>
        )}
        <ReactFlow<FlowNode, FlowEdge>
          nodes={props.nodes}
          edges={props.edges}
          nodeTypes={nodeTypes}
          onNodesChange={props.onNodesChange}
          onEdgesChange={props.onEdgesChange}
          onConnect={props.onConnect}
          onNodeClick={(_, node) => props.onSelectNode(node.id)}
          onPaneClick={() => props.onSelectNode(null)}
          isValidConnection={isValidConnection}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
          fitView
          fitViewOptions={{ padding: 0.12, minZoom: 0.35, maxZoom: 1.1 }}
          nodesConnectable={!props.readOnly}
          nodesDraggable={!props.readOnly}
          elementsSelectable={!props.readOnly}
          deleteKeyCode={props.readOnly ? null : ['Backspace', 'Delete']}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d8dbea" />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(node) => {
              const flowNode = node as FlowNode;
              return flowNode.data.nodeType === 'trigger'
                ? '#f59e0b'
                : flowNode.data.nodeType === 'ai'
                  ? '#8b5cf6'
                  : flowNode.data.nodeType === 'logic'
                    ? '#0ea5e9'
                    : '#10b981';
            }}
            className="!hidden !border !bg-white md:!block"
          />
        </ReactFlow>
      </div>

      <aside className="max-h-56 shrink-0 overflow-y-auto border-t bg-card p-4 lg:max-h-none lg:w-72 lg:border-l lg:border-t-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Node inspector</h2>
          {selectedNode && !props.readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              aria-label="Delete selected node"
              onClick={() => props.onDeleteNode(selectedNode.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {selectedNode ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="node-label" className="text-xs font-medium">Node label</label>
              <Input
                id="node-label"
                value={selectedNode.data.label}
                maxLength={200}
                disabled={props.readOnly}
                onChange={(event) => props.onUpdateNodeLabel(selectedNode.id, event.target.value)}
              />
            </div>
            <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-3 text-xs">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="text-right font-medium capitalize">{selectedNode.data.nodeType}</dd>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="text-right font-medium">{selectedNode.data.category.replace(/_/g, ' ')}</dd>
              <dt className="text-muted-foreground">Position</dt>
              <dd className="text-right font-mono">{Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}</dd>
            </dl>
            <NodeConfigurationEditor
              node={selectedNode}
              credentials={props.aiCredentials ?? []}
              onChange={(config) => props.onUpdateNodeConfig(selectedNode.id, config)}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            <Plus className="mx-auto mb-2 h-4 w-4" aria-hidden="true" />
            Select a node to inspect and rename it.
          </div>
        )}
      </aside>
    </div>
  );
}
