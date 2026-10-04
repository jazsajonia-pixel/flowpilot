import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Key, LoaderCircle, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AICredentialApiError, createAICredential, deleteAICredential, listAICredentials } from '@/lib/ai-api';
import type { AICredentialSummary, AIProviderId } from '@/types/ai';

const providerLabels: Record<AIProviderId, string> = { gemini: 'Google Gemini', openai: 'OpenAI' };

function getErrorMessage(error: unknown): string {
  if (error instanceof AICredentialApiError && error.status === 401) return 'Sign in to manage provider credentials.';
  return error instanceof Error ? error.message : 'Credential management is unavailable.';
}

export function AIProvidersPage() {
  const [credentials, setCredentials] = useState<AICredentialSummary[]>([]);
  const [provider, setProvider] = useState<AIProviderId>('gemini');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reloadCredentials = useCallback(async () => {
    setIsLoading(true);
    try {
      setCredentials(await listAICredentials());
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadCredentials();
  }, [reloadCredentials]);

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      await createAICredential({ provider, name, apiKey });
      setName('');
      setNotice('Credential encrypted and saved. Its full key will not be shown again.');
      await reloadCredentials();
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setApiKey('');
      setIsSaving(false);
    }
  }

  async function removeCredential(credential: AICredentialSummary) {
    const approved = window.confirm(`Remove “${credential.name}” from ${providerLabels[credential.provider]}? Workflows using it will no longer run until another credential is selected.`);
    if (!approved) return;
    setError(null);
    setNotice(null);
    try {
      await deleteAICredential(credential.id);
      setCredentials((current) => current.filter((item) => item.id !== credential.id));
      setNotice('Credential removed.');
    } catch (reason) {
      setError(getErrorMessage(reason));
    }
  }

  const credentialCount = credentials.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">AI Providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage server-encrypted Gemini and OpenAI keys, then choose a credential and model in AI nodes.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Key className="h-4 w-4 text-primary" /> Add a provider key</CardTitle>
            <CardDescription>The key is sent once over the authenticated connection, encrypted before database storage, and never returned by the API.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => void submitCredential(event)}>
              <div className="space-y-2">
                <Label htmlFor="ai-provider">Provider</Label>
                <select id="ai-provider" value={provider} onChange={(event) => setProvider(event.target.value as AIProviderId)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="credential-name">Label</Label>
                <Input id="credential-name" value={name} maxLength={80} autoComplete="off" placeholder="Personal Gemini key" onChange={(event) => setName(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-api-key">API key</Label>
                <Input id="provider-api-key" type="password" value={apiKey} maxLength={512} autoComplete="new-password" spellCheck={false} placeholder="Paste provider key" onChange={(event) => setApiKey(event.target.value)} required />
                <p className="text-xs leading-5 text-muted-foreground">Keys are never logged or included in workflow configuration. They are not recoverable after saving; replace a key by adding a new credential.</p>
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              {notice && <p className="text-sm text-emerald-700" role="status">{notice}</p>}
              <Button type="submit" disabled={isSaving || apiKey.length < 16 || name.trim().length === 0} className="w-full gap-2 sm:w-auto">
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isSaving ? 'Saving securely…' : 'Save encrypted key'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Built-in provider</CardTitle>
              <CardDescription>FlowPilot Gemini uses the server-managed key when an AI node has no user credential selected.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span>FlowPilot Gemini</span>
                <Badge variant="secondary">Environment managed</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your saved credentials</CardTitle>
              <CardDescription>{credentialCount} credential{credentialCount === 1 ? '' : 's'} · full keys are never displayed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading credentials…</p>
              ) : credentials.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No user-managed provider keys yet.</p>
              ) : credentials.map((credential) => (
                <div key={credential.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{credential.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{providerLabels[credential.provider]} · <span className="font-mono">{credential.maskedKey}</span></p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" aria-label={`Remove ${credential.name}`} onClick={() => void removeCredential(credential)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-primary" /> Security boundary</CardTitle>
          <CardDescription>Provider calls and secret decryption happen only in authenticated server functions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>Stored values use AES-256-GCM with the server-only <code>CREDENTIAL_ENCRYPTION_KEY</code>. The ciphertext is bound to the credential ID, owner, and provider; the vault fails closed if its key is not configured.</p>
          <p>Workflow nodes store only a credential ID. Every execution checks ownership against the signed-in session before decrypting and calling the fixed vendor API endpoint. Arbitrary custom endpoints are not accepted.</p>
        </CardContent>
      </Card>
    </div>
  );
}
