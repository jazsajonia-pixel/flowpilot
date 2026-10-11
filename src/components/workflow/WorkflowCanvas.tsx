import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
import { positionForGraph, positionForViewport } from './responsive-layout';
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

interface TouchNodeDrag {
  pointerId: number;
  category: string;
  label: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  const flowContainerRef = useRef<HTMLDivElement>(null);
  const touchDragRef = useRef<TouchNodeDrag | null>(null);
  const [nodeQuery, setNodeQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [touchDrag, setTouchDrag] = useState<TouchNodeDrag | null>(null);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow<FlowNode, FlowEdge>();
  const displayedNodes = useMemo(
    () => isNarrowViewport
      ? props.nodes.map((node) => ({ ...node, position: positionForViewport(node.position, true) }))
      : props.nodes,
    [isNarrowViewport, props.nodes],
  );
  const toModelPosition = useCallback((position: { x: number; y: number }) =>
    positionForGraph(position, isNarrowViewport),
  [isNarrowViewport]);
  const getAppendPosition = useCallback(() => {
    if (props.nodes.length === 0) {
      const bounds = flowContainerRef.current?.getBoundingClientRect();
      const center = bounds
        ? screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
        : { x: 0, y: 0 };
      return { x: center.x - 90, y: center.y - 42 };
    }
    const lastX = Math.max(...props.nodes.map((node) => node.position.x));
    const averageY = props.nodes.reduce((sum, node) => sum + node.position.y, 0) / props.nodes.length;
    return positionForViewport({ x: lastX + 220, y: averageY }, isNarrowViewport);
  }, [isNarrowViewport, props.nodes, screenToFlowPosition]);
  const getClearPosition = useCallback((point: { x: number; y: number }) => {
    const anchor = screenToFlowPosition(point);
    const canvas = flowContainerRef.current?.getBoundingClientRect();
    const topLeft = canvas ? screenToFlowPosition({ x: canvas.left + 8, y: canvas.top + 8 }) : null;
    const bottomRight = canvas ? screenToFlowPosition({ x: canvas.right - 8, y: canvas.bottom - 8 }) : null;
    const offsets = [
      [0, 0], [0, 110], [190, 0], [-190, 0], [0, -110],
      [190, 110], [-190, 110], [190, -110], [-190, -110], [0, 220],
    ] as const;
    for (const [offsetX, offsetY] of offsets) {
      const candidate = { x: anchor.x - 90 + offsetX, y: anchor.y - 42 + offsetY };
      if (topLeft && bottomRight) {
        candidate.x = Math.max(topLeft.x, Math.min(candidate.x, Math.max(topLeft.x, bottomRight.x - 180)));
        candidate.y = Math.max(topLeft.y, Math.min(candidate.y, Math.max(topLeft.y, bottomRight.y - 84)));
      }
      const overlaps = displayedNodes.some((node) =>
        candidate.x < node.position.x + 196 && candidate.x + 196 > node.position.x &&
        candidate.y < node.position.y + 100 && candidate.y + 100 > node.position.y,
      );
      if (!overlaps) return candidate;
    }
    return getAppendPosition();
  }, [displayedNodes, getAppendPosition, screenToFlowPosition]);
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
  const filteredCatalog = useMemo(
    () => NODE_CATALOG.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(nodeQuery.trim().toLowerCase())),
    [nodeQuery],
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const updateViewport = () => setIsNarrowViewport(media.matches);
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  const addAtCenter = useCallback(
    (definition: WorkflowNodeDefinition) => {
      const position = getAppendPosition();
      props.onAddNode(definition, toModelPosition(position));
      window.requestAnimationFrame(() => setCenter(position.x + 90, position.y + 42, { zoom: getZoom(), duration: 250 }));
    },
    [getAppendPosition, getZoom, props.onAddNode, setCenter, toModelPosition],
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
    props.onAddNode(definition, toModelPosition(getClearPosition({ x: event.clientX, y: event.clientY })));
  };

  const handleFlowNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    if (!isNarrowViewport) {
      props.onNodesChange(changes);
      return;
    }
    props.onNodesChange(changes.map((change) =>
      change.type === 'position' && change.position
        ? {
            ...change,
            position: positionForGraph(change.position, true),
            ...(change.positionAbsolute ? { positionAbsolute: positionForGraph(change.positionAbsolute, true) } : {}),
          }
        : change,
    ));
  }, [isNarrowViewport, props.onNodesChange]);

  const startTouchDrag = (event: ReactPointerEvent<HTMLButtonElement>, definition: WorkflowNodeDefinition) => {
    if (props.readOnly || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pending: TouchNodeDrag = {
      pointerId: event.pointerId,
      category: definition.category,
      label: definition.label,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    touchDragRef.current = pending;
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const pending = touchDragRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      const dragging = pending.dragging || Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 10;
      const next = { ...pending, x: event.clientX, y: event.clientY, dragging };
      touchDragRef.current = next;
      setTouchDrag(next);
      const bounds = flowContainerRef.current?.getBoundingClientRect();
      setIsDragOver(Boolean(dragging && bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom));
      if (dragging) event.preventDefault();
    };
    const finishPointer = (event: PointerEvent) => {
      const pending = touchDragRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      const dragging = pending.dragging || Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 10;
      const bounds = flowContainerRef.current?.getBoundingClientRect();
      const droppedOnCanvas = Boolean(bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom);
      const definition = NODE_CATALOG.find((item) => item.category === pending.category);
      if (dragging && droppedOnCanvas && definition && !(definition.type === 'trigger' && hasTrigger)) {
        props.onAddNode(definition, toModelPosition(getClearPosition({ x: event.clientX, y: event.clientY })));
      }
      touchDragRef.current = null;
      setTouchDrag(null);
      setIsDragOver(false);
    };
    const cancelPointer = (event: PointerEvent) => {
      if (touchDragRef.current?.pointerId !== event.pointerId) return;
      touchDragRef.current = null;
      setTouchDrag(null);
      setIsDragOver(false);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finishPointer);
    window.addEventListener('pointercancel', cancelPointer);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishPointer);
      window.removeEventListener('pointercancel', cancelPointer);
    };
  }, [getClearPosition, hasTrigger, props.onAddNode, screenToFlowPosition, toModelPosition]);

  const renderMobileItem = (definition: WorkflowNodeDefinition) => {
    const disabled = props.readOnly || (definition.type === 'trigger' && hasTrigger);
    const group = groupStyle[definition.type];
    const GroupIcon = group.icon;
    return (
      <div key={definition.category} className="flex h-11 w-40 shrink-0 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          draggable={!disabled}
          disabled={disabled}
          onDragStart={(event) => onDragStart(event, definition)}
          onClick={() => addAtCenter(definition)}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 text-left disabled:cursor-not-allowed disabled:opacity-45"
          title={`${definition.label}: tap to add`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${definition.type === 'trigger' ? 'bg-amber-50 text-amber-600' : definition.type === 'ai' ? 'bg-violet-50 text-violet-600' : definition.type === 'logic' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600'}`}><GroupIcon className="h-3.5 w-3.5" aria-hidden="true" /></span>
          <span className="min-w-0 truncate text-[11px] font-semibold text-slate-800">{definition.label}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Drag ${definition.label} onto the canvas`}
          title={`Drag ${definition.label} onto the canvas`}
          onPointerDown={(event) => startTouchDrag(event, definition)}
          className="touch-none border-l border-slate-100 px-2 text-slate-400 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
      <aside className="min-w-0 shrink-0 overflow-hidden border-b bg-white p-2 lg:max-h-none lg:w-[264px] lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r lg:p-4">
        <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
          <div className="min-w-0">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-800">Add a step</h2>
            <p className="text-[9px] text-slate-500">{isNarrowViewport ? 'Swipe · tap adds next · drag to place' : 'Click to add · drag onto canvas'}</p>
          </div>
          <label className="relative block w-36 shrink-0">
            <Search className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-slate-400" aria-hidden="true" />
            <Input value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} placeholder="Find a step" aria-label="Search workflow steps" className="h-7 rounded-lg border-slate-200 bg-slate-50 pl-7 text-[10px] focus:bg-white" />
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:hidden" aria-label="Workflow step library">
          {filteredCatalog.map(renderMobileItem)}
          {filteredCatalog.length === 0 && <p className="py-2 text-[10px] text-slate-500">No steps match that search.</p>}
        </div>
        <div className="hidden lg:block">
        <div className="pb-3">
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
          const definitions = filteredCatalog.filter((item) => item.type === type);
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
        {hasTrigger && <p className="hidden rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800 lg:block">This workflow already has a trigger.</p>}
        </div>
      </aside>

      <div
        ref={flowContainerRef}
        className={`relative min-h-0 min-w-0 flex-1 bg-[#f8f9fd] transition-colors duration-200 ${isDragOver ? 'flowpilot-drop-active' : ''} ${props.isExecuting ? 'flowpilot-flow-running' : ''}`}
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
          nodes={displayedNodes}
          edges={props.edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleFlowNodesChange}
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

      {touchDrag?.dragging && <div className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full rounded-lg border border-violet-200 bg-white/95 px-3 py-2 text-xs font-semibold text-violet-800 shadow-xl" style={{ left: touchDrag.x, top: touchDrag.y - 14 }}>{touchDrag.label}</div>}

      <aside className="max-h-56 shrink-0 overflow-y-auto border-t bg-card p-3 lg:max-h-none lg:w-72 lg:border-l lg:border-t-0 lg:p-4">
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
