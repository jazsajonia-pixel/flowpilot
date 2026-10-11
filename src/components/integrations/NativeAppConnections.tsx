import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CircleHelp, ExternalLink, LoaderCircle, PlugZap, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IntegrationApiError, beginIntegrationConnect, disconnectIntegration, listIntegrations } from '@/lib/integrations-api';
import type { ConnectedIntegration, IntegrationsResponse, OAuthProviderId } from '@/types/integrations';

const providerPresentation: Record<OAuthProviderId, {
  description: string;
  actionBoundary: string;
  icon: string;
  iconTone: string;
  accent: string;
}> = {
  gmail: {
    description: 'Authorize a Google account for the Gmail connection foundation.',
    actionBoundary: 'Gmail workflow actions will be enabled in a follow-up after the OAuth app is reviewed and verified.',
    icon: 'G',
    iconTone: 'bg-red-50 text-red-600',
    accent: 'border-red-100',
  },
  slack: {
    description: 'Authorize a Slack workspace for the Slack connection foundation.',
    actionBoundary: 'Channel selection and message actions are not part of this OAuth-foundation release.',
    icon: 'S',
    iconTone: 'bg-violet-50 text-violet-700',
    accent: 'border-violet-100',
  },
  airtable: {
    description: 'Authorize an Airtable account for the Airtable connection foundation.',
    actionBoundary: 'Base/table discovery and record actions are not part of this OAuth-foundation release.',
    icon: 'A',
    iconTone: 'bg-amber-50 text-amber-700',
    accent: 'border-amber-100',
  },
};

const providerOrder: OAuthProviderId[] = ['gmail', 'slack', 'airtable'];
const providerLabels: Record<OAuthProviderId, string> = { gmail: 'Gmail', slack: 'Slack', airtable: 'Airtable' };

function errorMessage(error: unknown): string {
  if (error instanceof IntegrationApiError && error.status === 401) return 'Sign in to manage connected apps.';
  return error instanceof Error ? error.message : 'Connected apps are unavailable.';
}

function accountStatus(status: ConnectedIntegration['status']): { label: string; tone: string } {
  if (status === 'connected') return { label: 'Connected', tone: 'bg-emerald-50 text-emerald-700' };
  if (status === 'reauth_required') return { label: 'Reconnect needed', tone: 'bg-amber-50 text-amber-800' };
  if (status === 'pending') return { label: 'Finishing setup', tone: 'bg-sky-50 text-sky-700' };
  return { label: 'Disconnected', tone: 'bg-slate-100 text-slate-600' };
}

export function NativeAppConnections() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<OAuthProviderId | null>(null);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listIntegrations();
      setData(result);
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('oauth');
    const provider = params.get('provider');
    if (result === 'connected' && (provider === 'gmail' || provider === 'slack' || provider === 'airtable')) {
      setNotice(`${providerLabels[provider]} connected. Provider workflow actions are still being built.`);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    } else if (result === 'denied') {
      setError('The provider connection was not approved. You can try again when ready.');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    } else if (result === 'expired') {
      setError('The sign-in session expired during provider authorization. Sign in again and retry.');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    } else if (result === 'failed') {
      setError('The provider could not be connected. Check its app setup and try again.');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    }
    void listIntegrations().then((integrations) => {
      if (active) {
        setData(integrations);
        if (!['failed', 'denied', 'expired'].includes(result ?? '')) setError(null);
      }
    }).catch((reason: unknown) => {
      if (active) setError(errorMessage(reason));
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const connectedCount = data ? data.accounts.filter((account) => account.status === 'connected').length : null;
  const providerStatus = useMemo(() => new Map((data?.providers ?? []).map((provider) => [provider.id, provider])), [data]);

  async function connect(provider: OAuthProviderId) {
    setError(null);
    setNotice(null);
    setBusyProvider(provider);
    try {
      const authorizationUrl = await beginIntegrationConnect(provider);
      window.location.assign(authorizationUrl);
    } catch (reason) {
      setError(errorMessage(reason));
      setBusyProvider(null);
    }
  }

  async function disconnect(account: ConnectedIntegration) {
    const approved = window.confirm(`Disconnect ${providerLabels[account.provider]} account “${account.name}” from FlowPilot? Its saved OAuth tokens will be removed. Any workflow steps using it will stop working.`);
    if (!approved) return;
    setError(null);
    setNotice(null);
    setBusyAccount(account.id);
    try {
      const result = await disconnectIntegration(account.provider, account.id);
      setData((current) => current ? { ...current, accounts: current.accounts.filter((entry) => entry.id !== account.id) } : current);
      setNotice(result.remoteRevocation === 'confirmed'
        ? `${providerLabels[account.provider]} disconnected and the provider confirmed token revocation.`
        : result.remoteRevocation === 'unavailable'
          ? `${providerLabels[account.provider]} tokens were removed from FlowPilot. Also revoke the app authorization in Airtable’s connected-app settings.`
          : `${providerLabels[account.provider]} tokens were removed from FlowPilot. Provider revocation could not be confirmed; review the provider’s app settings.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusyAccount(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm shadow-slate-950/[0.025]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><PlugZap className="h-3.5 w-3.5" /></span><h3 className="text-sm font-semibold text-slate-900">Connected apps</h3></div>
          <p className="mt-1 text-xs text-slate-500">Secure account authorization is ready. Provider-specific workflow actions are a separate next step.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${connectedCount !== null && connectedCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {isLoading ? 'Checking setup…' : connectedCount === null ? 'Status unavailable' : `${connectedCount} connected`}
          </span>
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh connected apps" disabled={isLoading} onClick={() => void reload()}>
            {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && <p className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800 sm:mx-6" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      {notice && <p className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800 sm:mx-6" role="status"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</p>}

      <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
        {providerOrder.map((provider) => {
          const details = providerPresentation[provider];
          const config = providerStatus.get(provider);
          const accounts = data?.accounts.filter((account) => account.provider === provider) ?? [];
          const configured = config?.configured === true;
          const vaultKeyMissing = config?.setupHint?.includes('CREDENTIAL_ENCRYPTION_KEY') ?? false;
          const setupStatus = data ? (configured ? 'OAuth ready' : vaultKeyMissing ? 'Encryption key needed' : 'Setup needed') : (isLoading ? 'Checking…' : 'Unavailable');
          return (
            <article key={provider} className={`flex min-h-[250px] flex-col p-4 transition-colors duration-200 hover:bg-slate-50/70 sm:p-5 ${details.accent}`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${details.iconTone}`}>{details.icon}</span>
                <Badge variant="secondary" className={configured ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}>{setupStatus}</Badge>
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900">{providerLabels[provider]}</h4>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{details.description}</p>

              <div className="mt-3 space-y-2">
                {accounts.map((account) => {
                  const status = accountStatus(account.status);
                  return (
                    <div key={account.id} className="flowpilot-connect-enter rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/[0.02]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{account.name}</p><p className="mt-1 text-[10px] text-slate-500">Updated {new Date(account.updatedAt).toLocaleDateString()}</p></div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${status.tone}`}>{status.label}</span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 gap-1 px-1.5 text-[10px] text-rose-700 hover:bg-rose-50" disabled={busyAccount === account.id} onClick={() => void disconnect(account)}>
                        {busyAccount === account.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
                        Disconnect
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-auto pt-4">
                <Button type="button" variant={configured ? 'outline' : 'secondary'} size="sm" className="w-full gap-2" disabled={!data || !configured || isLoading || busyProvider !== null} onClick={() => void connect(provider)}>
                  {busyProvider === provider ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : accounts.length ? <RefreshCw className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {busyProvider === provider ? 'Opening provider…' : !data ? 'Connection status unavailable' : configured ? (accounts.length ? 'Add or reconnect' : 'Connect account') : vaultKeyMissing ? 'Encryption key required' : 'Provider app not configured'}
                </Button>
                {!configured && config?.setupHint && <p className="mt-2 text-[10px] leading-4 text-slate-500">{config.setupHint}</p>}
                <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-slate-500"><CircleHelp className="mt-0.5 h-3 w-3 shrink-0" />{details.actionBoundary}</p>
              </div>
            </article>
          );
        })}
      </div>

      {isLoading && <div className="flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500" role="status"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Loading server connection status…</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[10px] leading-4 text-slate-500 sm:px-6"><ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />OAuth client secrets stay server-side. A missing provider app or encryption key disables Connect; FlowPilot never substitutes workflow secrets or a fake connection.</div>
    </section>
  );
}
