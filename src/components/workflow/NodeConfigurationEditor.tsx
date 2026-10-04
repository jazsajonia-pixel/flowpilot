import type { ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import type { FlowNode } from './flow-types';

interface NodeConfigurationEditorProps {
  node: FlowNode;
  onChange: (config: Record<string, unknown>) => void;
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

export function NodeConfigurationEditor({ node, onChange }: NodeConfigurationEditorProps) {
  const config = node.data.config;
  const update = (key: string, value: string) => onChange({ ...config, [key]: value });
  const textField = (key: string) => typeof config[key] === 'string' ? config[key] as string : '';
  const operator = textField('operator');
  const isPresenceCheck = operator === 'is_empty' || operator === 'is_not_empty';

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

  return <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">This node is not executable in Phase 4. AI nodes arrive in Phase 5; other triggers and integrations are later phases.</p>;
}
