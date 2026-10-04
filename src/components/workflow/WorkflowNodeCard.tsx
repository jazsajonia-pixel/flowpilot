import { ArrowUpRight, GitBranch, Sparkles, Zap } from 'lucide-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNode } from './flow-types';

const categoryStyle = {
  trigger: { icon: Zap, tone: 'border-amber-300 bg-amber-50 text-amber-900', accent: 'bg-amber-500' },
  ai: { icon: Sparkles, tone: 'border-violet-300 bg-violet-50 text-violet-900', accent: 'bg-violet-500' },
  logic: { icon: GitBranch, tone: 'border-sky-300 bg-sky-50 text-sky-900', accent: 'bg-sky-500' },
  action: { icon: ArrowUpRight, tone: 'border-emerald-300 bg-emerald-50 text-emerald-900', accent: 'bg-emerald-500' },
} as const;

export function WorkflowNodeCard({ data, selected, isConnectable }: NodeProps<FlowNode>) {
  const style = categoryStyle[data.nodeType];
  const Icon = style.icon;

  return (
    <div className={`relative min-w-40 rounded-xl border bg-card text-card-foreground shadow-lg transition-shadow ${selected ? 'ring-2 ring-primary ring-offset-2' : 'hover:shadow-xl'}`}>
      {data.nodeType !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          isConnectable={isConnectable}
          className="!h-3 !w-3 !border-2 !border-white !bg-slate-500"
        />
      )}
      <div className="flex items-center gap-3 px-3 py-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.tone}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block max-w-32 truncate text-sm font-semibold">{data.label}</span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
            {data.category.replace(/_/g, ' ')}
          </span>
        </span>
      </div>
      <div className={`h-1 w-full rounded-b-xl ${style.accent}`} />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        isConnectable={isConnectable}
        className="!h-3 !w-3 !border-2 !border-white !bg-primary"
      />
    </div>
  );
}
