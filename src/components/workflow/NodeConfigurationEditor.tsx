import type { ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { aiModelsForProvider, DEFAULT_AI_MODELS, isAIProviderId, type AICredentialSummary, type AIProviderId } from '@/types/ai';
import type { FlowNode } from './flow-types';

interface NodeConfigurationEditorProps {
  node: FlowNode;
  onChange: (config: Record<string, unknown>) => void;
  credentials?: AICredentialSummary[];
}

const comparisonOptions = [
  ['equals', 'Equals'],
  ['not_equals', 'Does not equal'],
  ['contains', 'Contains'],
  ['not_contains', 'Does not contain'],
  ['greater_than', 'Greater than'],
  ['less_than', 'Less than'],
  ['is_empty', 'Is empty'],
  ['is_not_empty', 'Is not empty'],
] as const;

export function NodeConfigurationEditor({ node, onChange, credentials = [] }: NodeConfigurationEditorProps) {
  const config = node.data.config;
  const update = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const textField = (key: string) => typeof config[key] === 'string' ? config[key] as string : typeof config[key] === 'number' ? String(config[key]) : '';
  const updateNumber = (key: string, value: string) => update(key, value === '' ? undefined : Number(value));
  const selectedProvider: AIProviderId = isAIProviderId(config.provider) ? config.provider : 'gemini';
  const operator = textField('operator');
  const isPresenceCheck = operator === 'is_empty' || operator === 'is_not_empty';

  const updateProvider = (value: string) => {
    if (!isAIProviderId(value)) return;
    const nextConfig: Record<string, unknown> = { ...config, provider: value, model: DEFAULT_AI_MODELS[value] };
    delete nextConfig.credentialId;
    onChange(nextConfig);
  };

  const renderAIProviderFields = () => {
    const availableCredentials = credentials.filter((credential) => credential.provider === selectedProvider);
    const modelOptions = aiModelsForProvider(selectedProvider);
    const selectedModel = modelOptions.some((option) => option.id === textField('model'))
      ? textField('model')
      : DEFAULT_AI_MODELS[selectedProvider];
    return (
      <section className="space-y-3 rounded-lg border bg-muted/20 p-3">
        <label className="block space-y-1.5 text-xs font-medium">
          AI provider
          <select value={selectedProvider} onChange={(event) => updateProvider(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Model
          <select value={selectedModel} onChange={(event) => update('model', event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            {modelOptions.map((option) => <option key={option.id} value={option.id}>{option.label}{option.recommended ? ' · Recommended' : ''}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Credential
          <select value={textField('credentialId')} onChange={(event) => {
            const nextConfig = { ...config };
            if (event.target.value) nextConfig.credentialId = event.target.value;
            else delete nextConfig.credentialId;
            onChange(nextConfig);
          }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            {selectedProvider === 'gemini' && <option value="">FlowPilot Gemini (server-managed)</option>}
            {selectedProvider === 'openai' && <option value="">Choose a saved OpenAI key</option>}
            {availableCredentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.name} · {credential.maskedKey}</option>)}
          </select>
        </label>
        {selectedProvider === 'openai' && availableCredentials.length === 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] leading-5 text-amber-950">Add an OpenAI key on the AI Providers page before running this node.</p>
        )}
        {selectedProvider === 'gemini' && !textField('credentialId') && (
          <p className="text-[11px] leading-5 text-muted-foreground">The server's <code>GEMINI_MODEL_ID</code> override is used when this node has no explicit model saved.</p>
        )}
        <p className="text-[11px] leading-5 text-muted-foreground">The workflow stores only the credential ID. Provider keys are decrypted on the server after owner verification.</p>
      </section>
    );
  };

  const renderOperator = () => (
    <label className="block space-y-1.5 text-xs font-medium">
      Comparison
      <select
        value={operator}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => update('operator', event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">Choose a comparison</option>
        {comparisonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );

  if (node.data.category === 'manual_trigger') {
    return <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">Start this workflow manually. The Run button accepts a JSON input payload for this trigger.</p>;
  }

  if (node.data.category === 'webhook_trigger') {
    return <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950"><strong>Webhook Trigger</strong><p>External systems start this workflow with a JSON object sent to the owner-only webhook URL. Save the graph, then activate the workflow to accept requests.</p><p className="text-[11px] text-sky-800">The endpoint URL is a bearer secret. Do not publish it in client code, logs, or public documentation.</p></div>;
  }

  if (node.data.category === 'condition') {
    return (
      <div className="space-y-3">
        <label className="block space-y-1.5 text-xs font-medium">
          Value or template path
          <Input value={textField('left')} maxLength={512} placeholder="{{trigger.body.status}}" onChange={(event) => update('left', event.target.value)} />
        </label>
        {renderOperator()}
        {!isPresenceCheck && (
          <label className="block space-y-1.5 text-xs font-medium">
            Compare with
            <Input value={textField('right')} maxLength={512} placeholder="approved" onChange={(event) => update('right', event.target.value)} />
          </label>
        )}
        <p className="text-[11px] leading-5 text-muted-foreground">Connect the True and False handles to route the graph. Use values such as <code>{'{{trigger.body.status}}'}</code> or <code>{'{{steps.NODE_ID.result}}'}</code>.</p>
      </div>
    );
  }

  if (node.data.category === 'filter') {
    return (
      <div className="space-y-3">
        <label className="block space-y-1.5 text-xs font-medium">
          Array path
          <Input value={textField('arrayPath')} maxLength={512} placeholder="trigger.body.items" onChange={(event) => update('arrayPath', event.target.value)} />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Item field path
          <Input value={textField('fieldPath')} maxLength={512} placeholder="status" onChange={(event) => update('fieldPath', event.target.value)} />
        </label>
        {renderOperator()}
        {!isPresenceCheck && (
          <label className="block space-y-1.5 text-xs font-medium">
            Compare with
            <Input value={textField('value')} maxLength={512} placeholder="open" onChange={(event) => update('value', event.target.value)} />
          </label>
        )}
        <p className="text-[11px] leading-5 text-muted-foreground">Filters the selected array and exposes the result at <code>{'{{steps.NODE_ID.items}}'}</code>.</p>
      </div>
    );
  }

  if (node.data.category === 'http_request' || node.data.category === 'webhook_action') {
    const isWebhook = node.data.category === 'webhook_action';
    const method = textField('method') || 'GET';
    const supportsBody = isWebhook || (method !== 'GET' && method !== 'DELETE');
    return (
      <div className="space-y-3">
        <label className="block space-y-1.5 text-xs font-medium">
          Public HTTPS URL
          <Input value={textField('url')} maxLength={2_048} type="url" placeholder="https://api.example.com/endpoint" onChange={(event) => update('url', event.target.value)} />
        </label>
        {!isWebhook && (
          <label className="block space-y-1.5 text-xs font-medium">
            Method
            <select
              value={method}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const nextMethod = event.target.value;
                const nextConfig: Record<string, unknown> = { ...config, method: nextMethod };
                if (nextMethod === 'GET' || nextMethod === 'DELETE') delete nextConfig.body;
                onChange(nextConfig);
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
        )}
        {supportsBody && (
          <label className="block space-y-1.5 text-xs font-medium">
            JSON body {isWebhook ? '(POST)' : '(optional)'}
            <textarea
              value={textField('body')}
              maxLength={32_768}
              rows={5}
              placeholder={'{\n  "email": "{{trigger.body.email}}"\n}'}
              onChange={(event) => update('body', event.target.value)}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            />
          </label>
        )}
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">HTTPS port 443 only; private IPs are blocked, redirects are not followed, and custom headers/credentials are not supported yet.</p>
      </div>
    );
  }

  if (node.data.category === 'gemini_ai') {
    const jsonOutput = textField('outputFormat') === 'json';
    return (
      <div className="space-y-3">
        {renderAIProviderFields()}
        <label className="block space-y-1.5 text-xs font-medium">
          Prompt
          <textarea value={textField('prompt')} maxLength={16_384} rows={5} placeholder={'Summarize this: {{trigger.body.text}}'} onChange={(event) => update('prompt', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          System instruction (optional)
          <textarea value={textField('systemInstruction')} maxLength={4_096} rows={3} placeholder="Answer clearly and concisely." onChange={(event) => update('systemInstruction', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs" />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Output format
          <select value={textField('outputFormat') || 'text'} onChange={(event) => update('outputFormat', event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="text">Text</option>
            <option value="json">JSON</option>
          </select>
        </label>
        {jsonOutput && (
          <label className="block space-y-1.5 text-xs font-medium">
            JSON Schema (optional)
            <textarea value={textField('responseSchema')} maxLength={8_192} rows={5} placeholder={'{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}'} onChange={(event) => update('responseSchema', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
          </label>
        )}
        {selectedProvider === 'openai' && jsonOutput && textField('responseSchema').trim() !== '' && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] leading-5 text-amber-950">For OpenAI, JSON Schema must have an object root, list every property as required, and set <code>additionalProperties</code> to false on every object.</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {selectedProvider === 'gemini' && <label className="block space-y-1.5 text-xs font-medium">
            Temperature
            <Input type="number" min="0" max="2" step="0.1" value={textField('temperature')} onChange={(event) => updateNumber('temperature', event.target.value)} />
          </label>}
          <label className="block space-y-1.5 text-xs font-medium">
            Max output tokens
            <Input type="number" min="1" max="2048" step="1" value={textField('maxTokens')} onChange={(event) => updateNumber('maxTokens', event.target.value)} />
          </label>
        </div>
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-[11px] leading-5 text-sky-950">Uses the FlowPilot Gemini provider on the server. The API key is never entered in the browser; execution logs contain summaries only.</p>
      </div>
    );
  }

  if (node.data.category === 'ai_generation') {
    return (
      <div className="space-y-3">
        {renderAIProviderFields()}
        <label className="block space-y-1.5 text-xs font-medium">
          Prompt
          <textarea value={textField('prompt')} maxLength={16_384} rows={5} placeholder="Write a helpful reply to {{trigger.body.name}}." onChange={(event) => update('prompt', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          System instruction (optional)
          <textarea value={textField('systemInstruction')} maxLength={4_096} rows={3} onChange={(event) => update('systemInstruction', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {selectedProvider === 'gemini' && <label className="block space-y-1.5 text-xs font-medium">
            Temperature
            <Input type="number" min="0" max="2" step="0.1" value={textField('temperature')} onChange={(event) => updateNumber('temperature', event.target.value)} />
          </label>}
          <label className="block space-y-1.5 text-xs font-medium">
            Max output tokens
            <Input type="number" min="1" max="2048" step="1" value={textField('maxTokens')} onChange={(event) => updateNumber('maxTokens', event.target.value)} />
          </label>
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">The response is available to later nodes as <code>{'{{steps.NODE_ID.result}}'}</code>.</p>
      </div>
    );
  }

  if (node.data.category === 'ai_classification') {
    const labels = Array.isArray(config.labels) ? config.labels.filter((value): value is string => typeof value === 'string') : [];
    return (
      <div className="space-y-3">
        {renderAIProviderFields()}
        <label className="block space-y-1.5 text-xs font-medium">
          Text to classify
          <textarea value={textField('input')} maxLength={16_384} rows={4} placeholder="{{trigger.body.message}}" onChange={(event) => update('input', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Allowed labels (one per line)
          <textarea value={labels.join('\n')} maxLength={3_200} rows={4} placeholder={'urgent\nnormal\nspam'} onChange={(event) => update('labels', event.target.value.split('\n').map((label) => label.trim()).filter(Boolean))} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs" />
        </label>
        <p className="text-[11px] leading-5 text-muted-foreground">Returns a JSON object with a label and confidence score from 0 to 1.</p>
      </div>
    );
  }

  if (node.data.category === 'ai_extraction') {
    return (
      <div className="space-y-3">
        {renderAIProviderFields()}
        <label className="block space-y-1.5 text-xs font-medium">
          Source text
          <textarea value={textField('input')} maxLength={16_384} rows={4} placeholder="{{trigger.body.document}}" onChange={(event) => update('input', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Extraction instruction (optional)
          <Input value={textField('instruction')} maxLength={4_096} placeholder="Extract the person, date, and amount." onChange={(event) => update('instruction', event.target.value)} />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Required JSON Schema
          <textarea value={textField('responseSchema')} maxLength={8_192} rows={6} placeholder={'{"type":"object","properties":{"person":{"type":"string"}},"required":["person"],"additionalProperties":false}'} onChange={(event) => update('responseSchema', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
        </label>
        {selectedProvider === 'openai' && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] leading-5 text-amber-950">OpenAI schemas require an object root, every property in <code>required</code>, and <code>additionalProperties: false</code> for every object.</p>}
      </div>
    );
  }

  if (node.data.category === 'ai_summarization') {
    return (
      <div className="space-y-3">
        {renderAIProviderFields()}
        <label className="block space-y-1.5 text-xs font-medium">
          Content to summarize
          <textarea value={textField('input')} maxLength={16_384} rows={5} placeholder="{{trigger.body.text}}" onChange={(event) => update('input', event.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Summary style
          <select value={textField('style') || 'brief'} onChange={(event) => update('style', event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="brief">Brief</option>
            <option value="detailed">Detailed</option>
            <option value="bullets">Bullets</option>
          </select>
        </label>
      </div>
    );
  }

  return <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">This node is not implemented in the current execution scope. Additional triggers and integrations are planned for later phases.</p>;
}
