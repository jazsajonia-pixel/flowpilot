import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createWebhookToken } from '../src/server/workflows/webhook-token';
import { webhookBodySchema } from '../src/server/workflows/webhook-validation';

test('webhook tokens are URL-safe, bounded, and independently generated', () => {
  const first = createWebhookToken();
  const second = createWebhookToken();

  assert.equal(first.length, 43);
  assert.equal(/^[A-Za-z0-9_-]+$/.test(first), true);
  assert.notEqual(first, second);
});

test('webhook body schema accepts objects and rejects arrays and scalar values', () => {
  assert.equal(webhookBodySchema.safeParse({ event: 'created' }).success, true);
  assert.equal(webhookBodySchema.safeParse([]).success, false);
  assert.equal(webhookBodySchema.safeParse('payload').success, false);
  assert.equal(webhookBodySchema.safeParse(null).success, false);
});
