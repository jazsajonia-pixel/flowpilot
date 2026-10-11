import { ArrowUpRight, Check, CircleAlert, GitBranch, LoaderCircle, Sparkles, Zap } from 'lucide-react';
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
  const executionStatus = data.executionStatus;
  const statusIcon = executionStatus === 'success' ? Check : executionStatus === 'error' ? CircleAlert : executionStatus === 'running' ? LoaderCircle : null;
  const StatusIcon = statusIcon;

  return (
    <div className={`flowpilot-node relative min-w-40 rounded-[15px] border border-slate-200 bg-white text-card-foreground shadow-lg transition-shadow ${executionStatus ? `flowpilot-node--${executionStatus}` : ''} ${selected ? 'ring-2 ring-primary ring-offset-2' : 'hover:shadow-xl'}`}>
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
        <span className="min-w-0 flex-1">
          <span className="block max-w-32 truncate text-[12px] font-semibold text-slate-900">{data.label}</span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
            {data.category.replace(/_/g, ' ')}
          </span>
        </span>
        {StatusIcon && <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${executionStatus === 'success' ? 'bg-emerald-50 text-emerald-600' : executionStatus === 'error' ? 'bg-rose-50 text-rose-600' : executionStatus === 'running' ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500'}`} title={`Step ${executionStatus}`}><StatusIcon className={`h-3.5 w-3.5 ${executionStatus === 'running' ? 'animate-spin' : ''}`} /></span>}
      </div>
      <div className={`h-1 w-full rounded-b-xl ${style.accent}`} />
      {data.category === 'condition' ? (
        <>
          <Handle type="source" position={Position.Right} id="true" isConnectable={isConnectable} style={{ top: '25%' }} title="True" className="!h-3 !w-3 !border-2 !border-white !bg-emerald-500" />
          <Handle type="source" position={Position.Right} id="out" isConnectable={isConnectable} style={{ top: '50%' }} title="Unconditional (legacy)" className="!h-3 !w-3 !border-2 !border-white !bg-primary" />
          <Handle type="source" position={Position.Right} id="false" isConnectable={isConnectable} style={{ top: '75%' }} title="False" className="!h-3 !w-3 !border-2 !border-white !bg-rose-500" />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          isConnectable={isConnectable}
          className="!h-3 !w-3 !border-2 !border-white !bg-primary"
        />
      )}
    </div>
  );
}
