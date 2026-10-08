import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  categoryOfLog,
  decodeExecutionCursor,
  durationMs,
  encodeExecutionCursor,
  INTERRUPTED_AFTER_MS,
  isInterrupted,
  parseExecutionListQuery,
  stepLabel,
  triggerFromCategory,
} from '../src/server/executions/history';
import { getExecution, listExecutions } from '../src/server/vercel-functions/executions';

const ID = '5b0f1c3e-8a52-4c5e-9d2f-0a1b2c3d4e5f';

test('cursors round-trip and reject tampering', () => {
  const cursor = { createdAt: new Date('2026-10-08T01:02:03.456Z'), id: ID };
  assert.deepEqual(decodeExecutionCursor(encodeExecutionCursor(cursor)), cursor);
  assert.equal(decodeExecutionCursor(Buffer.from(`2026-10-08T01:02:03.456Z|not-a-uuid`).toString('base64url')), null);
  assert.equal(decodeExecutionCursor(Buffer.from(`yesterday|${ID}`).toString('base64url')), null);
  assert.equal(decodeExecutionCursor(Buffer.from(`2026-10-08T01:02:03.456Z|${ID}|x`).toString('base64url')), null);
  assert.equal(decodeExecutionCursor('%%%'), null);
});

test('list filters accept known values and reject unknown or duplicate parameters', () => {
  assert.deepEqual(parseExecutionListQuery(new URLSearchParams('')), {});
  assert.deepEqual(parseExecutionListQuery(new URLSearchParams(`status=failed&workflowId=${ID}`)), { status: 'failed', workflowId: ID });
  assert.deepEqual(parseExecutionListQuery(new URLSearchParams('status=')), {});
  assert.equal(parseExecutionListQuery(new URLSearchParams('status=deleted')), null);
  assert.equal(parseExecutionListQuery(new URLSearchParams('workflowId=1 or 1=1')), null);
  assert.equal(parseExecutionListQuery(new URLSearchParams('ownerId=x')), null);
  assert.equal(parseExecutionListQuery(new URLSearchParams('status=failed&status=completed')), null);
  assert.equal(parseExecutionListQuery(new URLSearchParams('cursor=garbage')), null);
});

test('trigger type, interruption, duration, and step labels are derived safely', () => {
  assert.equal(triggerFromCategory('manual_trigger', null), 'manual');
  assert.equal(triggerFromCategory('webhook_trigger', null), 'webhook');
  assert.equal(triggerFromCategory(null, new Date()), 'schedule');
  assert.equal(triggerFromCategory('send_email', null), 'unknown');
  const old = new Date(Date.now() - INTERRUPTED_AFTER_MS - 1000);
  assert.equal(isInterrupted('running', old), true);
  assert.equal(isInterrupted('running', new Date()), false);
  assert.equal(isInterrupted('failed', old), false);
  assert.equal(durationMs(new Date(1000), new Date(3500)), 2500);
  assert.equal(durationMs(new Date(1000), null), null);
  assert.equal(categoryOfLog({ category: 'send_email' }), 'send_email');
  assert.equal(categoryOfLog({ category: 'drop_table' }), null);
  assert.equal(categoryOfLog('x'), null);
  const labels = new Map([[ID, 'Notify me']]);
  assert.equal(stepLabel(ID, 'send_email', labels), 'Notify me');
  assert.equal(stepLabel('gone', 'send_email', labels), 'Send Email');
  assert.equal(stepLabel('gone', null, labels), 'Workflow step');
});

test('history endpoints require GET and a signed-in owner', async () => {
  const post = await listExecutions(new Request('https://flowpilot.test/api/executions', { method: 'POST' }));
  assert.equal(post.status, 405);
  const anonymous = await listExecutions(new Request('https://flowpilot.test/api/executions'));
  assert.equal(anonymous.status, 401);
  const detail = await getExecution(new Request(`https://flowpilot.test/api/executions/${ID}`), { params: { executionId: ID } });
  assert.equal(detail.status, 401);
});
