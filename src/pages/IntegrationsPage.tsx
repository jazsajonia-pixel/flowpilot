import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Braces,
  Check,
  Database,
  FormInput,
  Globe2,
  Mail,
  MessageSquare,
  PlugZap,
  Table2,
  Webhook,
} from 'lucide-react';

const available = [
  { name: 'Google Gemini', kind: 'AI models', description: 'Generate, classify, extract, and summarize with a Gemini key saved in FlowPilot’s encrypted AI credential vault.', icon: Bot, tone: 'bg-violet-50 text-violet-700', href: '/ai-providers', action: 'Manage AI providers', tag: 'Ready · BYO key' },
  { name: 'Public HTTPS APIs', kind: 'API actions', description: 'Send bounded JSON requests to public HTTPS endpoints on port 443. Custom auth headers are not supported yet.', icon: Globe2, tone: 'bg-sky-50 text-sky-700', href: '/workflow-preview', action: 'Explore the builder', tag: 'Ready · no auth' },
  { name: 'Webhooks', kind: 'Triggers & actions', description: 'Start an active workflow with a JSON webhook or send a JSON payload to a public endpoint.', icon: Webhook, tone: 'bg-amber-50 text-amber-700', href: '/workflow-preview', action: 'Explore the builder', tag: 'Ready' },
  { name: 'Form submissions', kind: 'Data intake', description: 'A form tool can POST a JSON submission to a Webhook Trigger. A hosted drag-and-drop form designer is not included.', icon: FormInput, tone: 'bg-fuchsia-50 text-fuchsia-700', href: '/workflow-preview', action: 'Explore the builder', tag: 'Via webhook' },
  { name: 'FlowPilot data', kind: 'Private records', description: 'Create or update owner-private JSON records and pass their safe identifiers to later workflow steps.', icon: Database, tone: 'bg-emerald-50 text-emerald-700', href: '/data', action: 'Open data records', tag: 'Ready' },
  { name: 'Email notices', kind: 'Notifications', description: 'Send a plain-text notification to the account email address with bounded per-run and daily limits.', icon: Mail, tone: 'bg-rose-50 text-rose-700', href: '/workflow-preview', action: 'Explore the builder', tag: 'Ready' },
];

const planned = [
  { name: 'Gmail', detail: 'Google OAuth, sender selection, and Gmail API actions are not configured yet.', icon: Mail, tone: 'bg-red-50 text-red-600' },
  { name: 'Slack', detail: 'Workspace OAuth, channel selection, and message actions are not available yet.', icon: MessageSquare, tone: 'bg-violet-50 text-violet-600' },
  { name: 'Airtable', detail: 'Base/table discovery and record actions still need the native connector foundation.', icon: Table2, tone: 'bg-amber-50 text-amber-700' },
];

export function IntegrationsPage() {
  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[26px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-violet-50/70 p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-violet-700"><PlugZap className="h-3.5 w-3.5" /> Integration hub</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-[30px]">Connect the pieces. Keep the flow moving.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">See what you can use today and what still needs a secure account-connection flow. No pretend connect buttons—just clear capabilities and next steps.</p>
          </div>
          <Link to="/workflow-preview" className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-slate-950/10 transition-all hover:-translate-y-0.5 hover:bg-violet-800 md:self-auto">Open workflow canvas <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">Available building blocks</h3><p className="mt-1 text-xs text-slate-500">These steps can be added to a workflow now.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{available.length} available</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {available.map((item) => (
            <article key={item.name} className="group flex min-h-[205px] flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/[0.025] transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-950/[0.05] sm:p-5">
              <div className="flex items-start justify-between gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-[14px] ${item.tone}`}><item.icon className="h-5 w-5" /></span><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700"><Check className="h-3 w-3" />{item.tag}</span></div>
              <div className="mt-4"><p className="text-sm font-semibold text-slate-900">{item.name}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{item.kind}</p><p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p></div>
              <Link to={item.href} className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[11px] font-semibold text-violet-700 transition-colors hover:text-violet-900">{item.action}<ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm shadow-slate-950/[0.025]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h3 className="text-sm font-semibold text-slate-900">Native app connections</h3><p className="mt-1 text-xs text-slate-500">These need OAuth, secure token storage, and tested provider actions before they can be connected.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Not connected</span></div>
        <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
          {planned.map((item) => (
            <div key={item.name} className="flex gap-3 p-4 sm:p-5"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}><item.icon className="h-[18px] w-[18px]" /></span><div><div className="flex items-center gap-2"><p className="text-xs font-semibold text-slate-800">{item.name}</p><span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">Planned</span></div><p className="mt-1.5 text-[11px] leading-5 text-slate-500">{item.detail}</p></div></div>
          ))}
        </div>
      </section>

      <aside className="flex gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 sm:p-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm"><Braces className="h-4 w-4" /></span><div><p className="text-xs font-semibold text-sky-950">Credential safety is a product boundary</p><p className="mt-1 text-[11px] leading-5 text-sky-900/80">FlowPilot currently blocks custom API auth headers to avoid storing tokens in workflow graphs. Gmail, Slack, and Airtable require the planned encrypted OAuth account layer; adding provider keys to a workflow is not a safe workaround.</p></div></aside>
    </div>
  );
}
