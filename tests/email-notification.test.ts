import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { executeWorkflowGraph } from '../src/server/execution/engine';
import { workflowGraphSchema, type WorkflowGraphInput } from '../src/server/workflows/graph-validation';
import {
  createOwnerEmailSender,
  createResendTransport,
  EmailNotificationError,
  MAX_EMAILS_PER_OWNER_PER_DAY,
  MAX_EMAILS_PER_RUN,
  sanitizeEmailSubject,
  type EmailDelivery,
} from '../src/server/notifications/email';

const TRIGGER = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0001';
const EMAIL = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0002';

function graph(config: Record<string, unknown>, emailNodes = 1): WorkflowGraphInput {
  const emails = Array.from({ length: emailNodes }, (_, index) => ({
    id: `c18b6c07-750c-4be1-a1e0-8b1a5f2e01${String(index).padStart(2, '0')}`,
    type: 'action', category: 'send_email', label: 'Email', position: { x: 0, y: 0 }, config,
  }));
  if (emailNodes === 1) emails[0].id = EMAIL;
  return workflowGraphSchema.parse({
    nodes: [{ id: TRIGGER, type: 'trigger', category: 'manual_trigger', label: 'Start', position: { x: 0, y: 0 }, config: {} }, ...emails],
    connections: emails.map((email, index) => ({ id: `c18b6c07-750c-4be1-a1e0-8b1a5f2e02${String(index).padStart(2, '0')}`, sourceNodeId: TRIGGER, targetNodeId: email.id })),
  });
}

function recordingSender(recent = 0, ownerEmail: string | null = 'owner@example.test') {
  const deliveries: EmailDelivery[] = [];
  let counted = 0;
  const sender = createOwnerEmailSender({
    loadOwnerEmail: async () => ownerEmail,
    countRecentSends: async () => { counted += 1; return recent; },
    transport: async (delivery) => { deliveries.push(delivery); },
  });
  return { sender, deliveries, counted: () => counted };
}

test('send_email config accepts subject/body templates and rejects recipient fields', () => {
  const base = { id: EMAIL, type: 'action', category: 'send_email', label: 'Email', position: { x: 0, y: 0 } };
  const parse = (config: Record<string, unknown>) => workflowGraphSchema.safeParse({ nodes: [{ ...base, config }], connections: [] }).success;
  assert.equal(parse({}), true);
  assert.equal(parse({ subject: 'Hi {{trigger.name}}', body: 'Body' }), true);
  assert.equal(parse({ subject: 'Hi', body: 'Body', to: 'victim@example.test' }), false);
  assert.equal(parse({ subject: 'x'.repeat(513) }), false);
});

test('engine renders templates and sends only to the owner address', async () => {
  const { sender, deliveries } = recordingSender();
  const result = await executeWorkflowGraph(graph({ subject: 'Lead: {{trigger.name}}', body: 'Score {{trigger.score}}' }), { name: 'Ada', score: 9, to: 'attacker@example.test' }, { sendEmail: sender });
  assert.equal(result.status, 'completed');
  assert.equal(deliveries.length, 1);
  assert.deepEqual({ to: deliveries[0].to, subject: deliveries[0].subject, text: deliveries[0].text }, { to: 'owner@example.test', subject: 'Lead: Ada', text: 'Score 9' });
  const log = result.logs.find((entry) => entry.nodeId === EMAIL);
  assert.deepEqual(log?.outputData, { sent: true });
  assert.equal(JSON.stringify(result.logs).includes('owner@example.test'), false);
  assert.equal(JSON.stringify(result.logs).includes('Ada'), false);
});

test('engine fails closed with a fixed message when email is not configured', async () => {
  const result = await executeWorkflowGraph(graph({ subject: 'Hi', body: 'Body' }), {}, {});
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'Email notifications are not configured on this server.');
});

test('missing or oversized rendered content fails without sending', async () => {
  const { sender, deliveries } = recordingSender();
  const empty = await executeWorkflowGraph(graph({ subject: '{{trigger.missing}}', body: 'Body' }), {}, { sendEmail: sender });
  assert.equal(empty.error, 'The email subject and body are required.');
  const long = await executeWorkflowGraph(graph({ subject: 'Hi', body: '{{trigger.text}}' }), { text: 'x'.repeat(10_001) }, { sendEmail: sender });
  assert.equal(long.error, 'The email subject or body is too long.');
  assert.equal(deliveries.length, 0);
});

test('subjects are stripped of control characters', () => {
  assert.equal(sanitizeEmailSubject('Hello\r\nBcc: victim@example.test'), 'Hello Bcc: victim@example.test');
  assert.equal(sanitizeEmailSubject('  a\tb  '), 'a b');
});

test('per-run cap stops the fourth email in one execution', async () => {
  const { sender, deliveries, counted } = recordingSender();
  const result = await executeWorkflowGraph(graph({ subject: 'Hi', body: 'Body' }, MAX_EMAILS_PER_RUN + 1), {}, { sendEmail: sender });
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'Email limit reached for this run.');
  assert.equal(deliveries.length, MAX_EMAILS_PER_RUN);
  assert.equal(counted(), 1);
});

test('daily cap uses persisted history plus sends in this run', async () => {
  const atLimit = recordingSender(MAX_EMAILS_PER_OWNER_PER_DAY);
  await assert.rejects(atLimit.sender({ subject: 'Hi', text: 'Body' }, 1_000), (error: unknown) => error instanceof EmailNotificationError && error.message === 'Daily email limit reached for this account.');
  const nearLimit = recordingSender(MAX_EMAILS_PER_OWNER_PER_DAY - 1);
  await nearLimit.sender({ subject: 'Hi', text: 'Body' }, 1_000);
  await assert.rejects(nearLimit.sender({ subject: 'Hi', text: 'Body' }, 1_000), /Daily email limit/);
  assert.equal(nearLimit.deliveries.length, 1);
});

test('a missing owner address fails closed', async () => {
  const { sender } = recordingSender(0, null);
  await assert.rejects(sender({ subject: 'Hi', text: 'Body' }, 1_000), /not configured/);
});

test('resend transport is disabled without key or sender and posts the fixed request otherwise', async () => {
  assert.equal(createResendTransport({ apiKey: '', from: 'a@b.test' }), null);
  assert.equal(createResendTransport({ apiKey: 'key', from: undefined }), null);
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport = createResendTransport({
    apiKey: 're_test_key',
    from: 'FlowPilot <n@example.test>',
    fetchImpl: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{"id":"x"}', { status: 200 }); }) as typeof fetch,
  });
  assert.ok(transport);
  await transport({ to: 'owner@example.test', subject: 'Hi', text: 'Body', timeoutMs: 1_000 });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { from: 'FlowPilot <n@example.test>', to: ['owner@example.test'], subject: 'Hi', text: 'Body' });
});

test('provider failures surface only fixed messages', async () => {
  const rejecting = createResendTransport({ apiKey: 'k', from: 'f@example.test', fetchImpl: (async () => new Response('{"message":"secret detail re_abc"}', { status: 422 })) as typeof fetch });
  await assert.rejects(rejecting!({ to: 'o@example.test', subject: 'Hi', text: 'Body', timeoutMs: 1_000 }), (error: unknown) => error instanceof Error && error.message === 'The email provider rejected the message.');
  const timeout = createResendTransport({ apiKey: 'k', from: 'f@example.test', fetchImpl: (async () => { throw new DOMException('timed out', 'TimeoutError'); }) as typeof fetch });
  await assert.rejects(timeout!({ to: 'o@example.test', subject: 'Hi', text: 'Body', timeoutMs: 1_000 }), /timed out/);
});
