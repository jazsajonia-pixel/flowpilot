import { NavLink } from 'react-router-dom';
import {
  Activity,
  Blocks,
  Bot,
  Database,
  LayoutDashboard,
  Layers,
  Settings,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import { APP_CONFIG } from '@/config';
import { cn } from '@/lib/utils';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const mainNav = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Workflows', href: '/workflows', icon: Workflow },
  { name: 'Templates', href: '/templates', icon: Layers },
  { name: 'Run history', href: '/executions', icon: Activity },
];

const buildNav = [
  { name: 'AI providers', href: '/ai-providers', icon: Bot },
  { name: 'Integrations', href: '/integrations', icon: Blocks },
  { name: 'Data records', href: '/data', icon: Database },
];

const systemNav = [{ name: 'Settings', href: '/settings', icon: Settings }];

function NavigationGroup({ title, links, onClose }: { title: string; links: typeof mainNav; onClose: () => void }) {
  return (
    <div>
      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <nav className="space-y-1" aria-label={title}>
        {links.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={onClose}
            className={({ isActive }) => cn(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
              isActive
                ? 'bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100',
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-violet-300 to-sky-300" />}
                <item.icon className={cn('h-[17px] w-[17px] shrink-0 transition-colors', isActive ? 'text-violet-200' : 'text-slate-500 group-hover:text-slate-300')} aria-hidden="true" />
                <span>{item.name}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      {isOpen && <button type="button" className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={onClose} aria-label="Close navigation" />}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-[258px] flex-col border-r border-white/[0.06] bg-[#111526] text-white shadow-2xl transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-[76px] items-center justify-between border-b border-white/[0.07] px-5">
          <NavLink to="/dashboard" onClick={onClose} className="group flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-violet-400 via-indigo-500 to-sky-400 shadow-lg shadow-violet-950/40 transition-transform duration-300 group-hover:rotate-[-7deg] group-hover:scale-105">
              <Sparkles className="h-[19px] w-[19px] text-white" aria-hidden="true" />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#111526] bg-emerald-400" />
            </span>
            <span className="flex flex-col">
              <span className="text-[16px] font-bold tracking-tight text-white">FlowPilot</span>
              <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">Automation studio</span>
            </span>
          </NavLink>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close sidebar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-3.5 py-6">
          <NavigationGroup title="Workspace" links={mainNav} onClose={onClose} />
          <NavigationGroup title="Build & connect" links={buildNav} onClose={onClose} />
          <NavigationGroup title="Preferences" links={systemNav} onClose={onClose} />
        </div>

        <div className="border-t border-white/[0.07] p-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.045] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-200">Product status</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/10 px-2 py-1 text-[9px] font-semibold text-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Building
              </span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-500">{APP_CONFIG.currentPhase}</p>
          </div>
          <p className="mt-3 px-1 text-[9px] tracking-wide text-slate-600">FLOWPILOT · MOVE WORK FORWARD</p>
        </div>
      </aside>
    </>
  );
}
