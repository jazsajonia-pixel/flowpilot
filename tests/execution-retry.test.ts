import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { AIProvider } from '../src/types/ai';
import type { WorkflowGraphInput } from '../src/server/workflows/graph-validation';
import { AIProviderError, isTransientProviderFailure } from '../src/server/ai/errors';
import { executeWorkflowGraph, MAX_RETRIES_PER_RUN, RETRY_BACKOFF_MS } from '../src/server/execution/engine';
import { OutboundRequestError } from '../src/server/execution/outbound-http';
import { planRetry, retryOfFrom } from '../src/server/executions/retry';
import { retryExecution } from '../src/server/vercel-functions/executions';

const T = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0001';
const RUN = '5b0f1c3e-8a52-4c5e-9d2f-0a1b2c3d4e5f';
const ok = { status: 200, contentType: 'application/json', body: { accepted: true }, responseBytes: 17 };
const noSleep = async () => {};

function step(index: number, category: string, config: Record<string, unknown>) {
  const id = `c18b6c07-750c-4be1-a1e0-8b1a5f2e01${String(index).padStart(2, '0')}`;
  const type = category.startsWith('ai_') ? 'ai' : 'action';
  return { id, type, category, label: category, position: { x: 0, y: 0 }, config } as WorkflowGraphInput['nodes'][number];
}

function chain(...steps: WorkflowGraphInput['nodes']): WorkflowGraphInput {
  const nodes = [{ id: T, type: 'trigger', category: 'manual_trigger', label: 'Start', position: { x: 0, y: 0 }, config: {} } as WorkflowGraphInput['nodes'][number], ...steps];
  return {
    nodes,
    connections: steps.map((target, index) => ({
      id: `c18b6c07-750c-4be1-a1e0-8b1a5f2e02${String(index).padStart(2, '0')}`,
      sourceNodeId: nodes[index].id, sourceHandle: 'out', targetNodeId: target.id, targetHandle: 'in',
    })) as WorkflowGraphInput['connections'],
  };
}

function flakyRequest(failures: Array<OutboundRequestError | null>) {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    const failure = failures.shift();
    if (failure) throw failure;
    return ok;
  };
  return { fn, calls: () => calls };
}

const http = (status: number) => new OutboundRequestError(`The external service returned HTTP ${status}.`, { kind: 'http_status', status });

test('transient provider failures are classified without reading error messages', () => {
  assert.equal(isTransientProviderFailure(Object.assign(new Error('x'), { status: 429 }), false), true);
  assert.equal(isTransientProviderFailure(Object.assign(new Error('x'), { status: 503 }), false), true);
  assert.equal(isTransientProviderFailure(Object.assign(new Error('x'), { status: 401 }), false), false);
  assert.equal(isTransientProviderFailure(Object.assign(new Error('x'), { status: 400 }), false), false);
  assert.equal(isTransientProviderFailure(new TypeError('fetch failed'), false), true);
  assert.equal(isTransientProviderFailure(new TypeError('fetch failed'), true), false);
  assert.equal(isTransientProviderFailure('nope', false), false);
});

test('a GET step that hits HTTP 502 once is retried and records attempts', async () => {
  const flaky = flakyRequest([http(502)]);
  const delays: number[] = [];
  const result = await executeWorkflowGraph(chain(step(0, 'http_request', { url: 'https://example.com', method: 'GET' })), {}, {
    request: flaky.fn, sleep: async (ms) => { delays.push(ms); },
  });
  assert.equal(result.status, 'completed');
  assert.equal(flaky.calls(), 2);
  assert.deepEqual(delays, [RETRY_BACKOFF_MS]);
  assert.equal((result.logs[1].outputData as { attempts?: number }).attempts, 2);
});

test('POST webhook actions retry only when the server clearly did not process the request', async () => {
  const webhook = step(0, 'webhook_action', { url: 'https://example.com/hook' });
  const rateLimited = flakyRequest([http(429)]);
  assert.equal((await executeWorkflowGraph(chain(webhook), {}, { request: rateLimited.fn, sleep: noSleep })).status, 'completed');
  assert.equal(rateLimited.calls(), 2);
  for (const failure of [http(502), new OutboundRequestError('The external request timed out.', { kind: 'timeout' }), new OutboundRequestError('The external request failed.', { kind: 'connection' })]) {
    const flaky = flakyRequest([failure]);
    const result = await executeWorkflowGraph(chain(webhook), {}, { request: flaky.fn, sleep: noSleep });
    assert.equal(result.status, 'failed');
    assert.equal(flaky.calls(), 1, failure.message);
  }
});

test('permanent HTTP errors and blocked destinations are never retried', async () => {
  for (const failure of [http(404), http(401), new OutboundRequestError('Only public HTTPS destinations on port 443 are allowed.')]) {
    const flaky = flakyRequest([failure]);
    const result = await executeWorkflowGraph(chain(step(0, 'http_request', { url: 'https://example.com', method: 'GET' })), {}, { request: flaky.fn, sleep: noSleep });
    assert.equal(result.status, 'failed');
    assert.equal(flaky.calls(), 1);
    assert.equal(result.logs[1].outputData, undefined);
  }
});

test('each step gets one retry; a second failure fails the run and logs attempts', async () => {
  const flaky = flakyRequest([http(503), http(503)]);
  const result = await executeWorkflowGraph(chain(step(0, 'http_request', { url: 'https://example.com', method: 'GET' })), {}, { request: flaky.fn, sleep: noSleep });
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'The external service returned HTTP 503.');
  assert.equal(flaky.calls(), 2);
  assert.deepEqual(result.logs[1].outputData, { attempts: 2 });
});

test('retries are capped per run', async () => {
  const steps = Array.from({ length: MAX_RETRIES_PER_RUN + 1 }, (_, index) => step(index, 'http_request', { url: 'https://example.com', method: 'GET' }));
  // Each step fails once, then its retry succeeds; the last step has no retry budget left.
  const flaky = flakyRequest(Array.from({ length: MAX_RETRIES_PER_RUN + 1 }, () => [http(503), null]).flat());
  const result = await executeWorkflowGraph(chain(...steps), {}, { request: flaky.fn, sleep: noSleep });
  assert.equal(result.status, 'failed');
  assert.equal(flaky.calls(), MAX_RETRIES_PER_RUN * 2 + 1);
});

test('no retry when the run budget is nearly spent', async () => {
  let clock = 0;
  const flaky = flakyRequest([http(503)]);
  const request = async () => { clock += 7_000; return flaky.fn(); };
  const result = await executeWorkflowGraph(chain(step(0, 'http_request', { url: 'https://example.com', method: 'GET' })), {}, { request, sleep: noSleep, now: () => clock });
  assert.equal(result.status, 'failed');
  assert.equal(flaky.calls(), 1);
});

test('AI steps retry transient provider failures but not permanent ones', async () => {
  let calls = 0;
  const flakyProvider: AIProvider = {
    id: 'gemini', name: 'Test',
    generateCompletion: async () => {
      calls += 1;
      if (calls === 1) throw new AIProviderError('The AI provider request failed.', { retryable: true });
      return { text: 'hello', model: 'test-model' };
    },
  };
  const graph = chain(step(0, 'ai_generation', { prompt: 'Say hi' }));
  assert.equal((await executeWorkflowGraph(graph, {}, { aiProvider: flakyProvider, sleep: noSleep })).status, 'completed');
  assert.equal(calls, 2);
  let badKeyCalls = 0;
  const badKey: AIProvider = { id: 'gemini', name: 'Test', generateCompletion: async () => { badKeyCalls += 1; throw new AIProviderError('The AI provider request failed.'); } };
  assert.equal((await executeWorkflowGraph(graph, {}, { aiProvider: badKey, sleep: noSleep })).status, 'failed');
  assert.equal(badKeyCalls, 1);
});

test('replay rules: only failed/interrupted runs whose input can be faithfully reproduced', () => {
  const base = { id: RUN, status: 'failed', interrupted: false, trigger: 'manual' as const, triggerData: { received: true, topLevelFieldCount: 0 } };
  const manual = planRetry(base, 'manual_trigger');
  assert.equal(manual.ok, true);
  assert.deepEqual(manual.ok && manual.triggerData, { received: true, topLevelFieldCount: 0, retryOf: RUN });
  assert.equal(retryOfFrom(manual.ok ? manual.triggerData : null), RUN);
  assert.equal(planRetry({ ...base, status: 'completed' }, 'manual_trigger').ok, false);
  assert.equal(planRetry({ ...base, status: 'running' }, 'manual_trigger').ok, false);
  assert.equal(planRetry({ ...base, status: 'running', interrupted: true }, 'manual_trigger').ok, true);
  const withInput = planRetry({ ...base, triggerData: { received: true, topLevelFieldCount: 2 } }, 'manual_trigger');
  assert.equal(withInput.ok, false);
  assert.match(!withInput.ok ? withInput.error : '', /isn't stored for privacy/);
  assert.equal(planRetry(base, 'webhook_trigger').ok, false);
  assert.equal(planRetry(base, null).ok, false);
  const schedule = planRetry({ ...base, trigger: 'schedule', triggerData: { scheduledAt: '2026-10-08T00:00:00.000Z', frequency: 'daily' } }, 'schedule_trigger');
  assert.deepEqual(schedule.ok && schedule.triggerInput, { scheduledAt: '2026-10-08T00:00:00.000Z', frequency: 'daily' });
  assert.equal(planRetry({ ...base, trigger: 'schedule', triggerData: { scheduledAt: 'soon' } }, 'schedule_trigger').ok, false);
});

test('retry endpoint requires POST, same origin, and a signed-in owner', async () => {
  const url = `https://flowpilot.test/api/executions/${RUN}/retry`;
  assert.equal((await retryExecution(new Request(url), { params: { executionId: RUN } })).status, 405);
  assert.equal((await retryExecution(new Request(url, { method: 'POST', headers: { origin: 'https://evil.test' } }), { params: { executionId: RUN } })).status, 403);
  assert.equal((await retryExecution(new Request(url, { method: 'POST', headers: { origin: 'https://flowpilot.test' } }), { params: { executionId: RUN } })).status, 401);
});
