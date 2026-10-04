import { useCallback, useMemo, useRef, type DragEvent } from 'react';
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
import { ArrowUpRight, GitBranch, Plus, Sparkles, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NODE_CATALOG, type NodeType, type WorkflowNodeDefinition } from '@/types/workflow';
import { isWorkflowConnectionAllowed } from '@/lib/workflow-graph';
import { toWorkflowConnection } from './graph-mapping';
import type { FlowEdge, FlowNode } from './flow-types';
import { WorkflowNodeCard } from './WorkflowNodeCard';

interface WorkflowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  readOnly?: boolean;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  onSelectNode: (nodeId: string | null) => void;
  onAddNode: (definition: WorkflowNodeDefinition, position: { x: number; y: number }) => void;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
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
  const { screenToFlowPosition } = useReactFlow<FlowNode, FlowEdge>();
  const selectedNode = props.nodes.find((node) => node.id === props.selectedNodeId) ?? null;
  const graphNodes = useMemo(
    () => props.nodes.map((node) => ({ id: node.id, type: node.data.nodeType, category: node.data.category })),
    [props.nodes],
  );
  const graphEdges = useMemo(() => props.edges.map(toWorkflowConnection), [props.edges]);
  const isValidConnection = useCallback(
    (connection: Connection | FlowEdge) =>
      isWorkflowConnectionAllowed(connection.source, connection.target, graphNodes, graphEdges),
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
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const category = event.dataTransfer.getData('application/flowpilot-node');
    const definition = NODE_CATALOG.find((candidate) => candidate.category === category);
    if (!definition || (definition.type === 'trigger' && hasTrigger)) return;
    props.onAddNode(definition, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="flex max-h-40 shrink-0 gap-2 overflow-x-auto border-b bg-card p-3 lg:max-h-none lg:w-64 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r">
        <div className="hidden pb-2 lg:block">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Node library</h2>
          <p className="mt-1 text-xs text-muted-foreground">Drag a node onto the canvas, or tap to add it.</p>
        </div>
        {nodeTypeOrder.map((type) => {
          const group = groupStyle[type];
          const GroupIcon = group.icon;
          const definitions = NODE_CATALOG.filter((item) => item.type === type);
          return (
            <section key={type} className="min-w-52 lg:min-w-0">
              <h3 className={`mb-1 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider ${group.className}`}>
                <GroupIcon className="h-3.5 w-3.5" aria-hidden="true" /> {group.label}
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
                      className="min-w-44 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 lg:min-w-0"
                      title={definition.description}
                    >
                      <span className="block truncate text-xs font-semibold">{definition.label}</span>
                      <span className="mt-0.5 hidden text-[10px] leading-4 text-muted-foreground lg:block">{definition.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {hasTrigger && <p className="hidden rounded-md bg-muted px-2 py-2 text-[11px] text-muted-foreground lg:block">This workflow already has a trigger.</p>}
      </aside>

      <div
        ref={flowContainerRef}
        className="relative min-h-[55vh] min-w-0 flex-1 bg-slate-50 lg:min-h-0"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
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
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
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
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">
              Node-specific settings are added in later phases. Do not store API keys, passwords, or tokens in workflow configuration.
            </p>
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
