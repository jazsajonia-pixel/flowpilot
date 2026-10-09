import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { handler } from '../src/server/vercel-functions/health';

test('health handler returns an uncached JSON liveness response', async () => {
  const response = await handler(
    {} as Parameters<typeof handler>[0],
    {} as Parameters<typeof handler>[1],
  );

  assert.ok(response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers?.['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(response.headers?.['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(response.body ?? ''), {
    ok: true,
    service: 'flowpilot-api',
    status: 'healthy',
  });
});
