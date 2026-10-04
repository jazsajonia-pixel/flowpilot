import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { WorkflowGraphInput } from '../src/server/workflows/graph-validation';
import { executeWorkflowGraph } from '../src/server/execution/engine';
import { summarizeTriggerInput } from '../src/server/execution/logging';
import {
  assertPublicResolvedAddresses,
  isPublicUnicastAddress,
  OutboundRequestError,
  sendPublicHttpsRequest,
  validateOutboundUrl,
} from '../src/server/execution/outbound-http';
import { readExecutionPath, resolveTemplate } from '../src/server/execution/templates';

const ids = {
  trigger: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0001',
  filter: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0002',
  condition: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0003',
  trueAction: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0004',
  falseAction: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0005',
  ai: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0006',
};

function node(id: string, category: string, config: Record<string, unknown> = {}) {
  const type = category.endsWith('_trigger') ? 'trigger' : category === 'condition' || category === 'filter' ? 'logic' : category.startsWith('ai_') || category === 'gemini_ai' ? 'ai' : 'action';
  return { id, type, category, label: category, position: { x: 0, y: 0 }, config } as WorkflowGraphInput['nodes'][number];
}

function edge(id: string, sourceNodeId: string, targetNodeId: string, sourceHandle = 'out') {
  return { id, sourceNodeId, sourceHandle, targetNodeId, targetHandle: 'in' } as WorkflowGraphInput['connections'][number];
}

const fakeHttpResponse = { status: 200, contentType: 'application/json', body: { accepted: true }, responseBytes: 17 };

test('condition branches only through the matching true/false handle', async () => {
  const graph: WorkflowGraphInput = {
    nodes: [
      node(ids.trigger, 'manual_trigger'),
      node(ids.condition, 'condition', { left: '{{trigger.body.status}}', operator: 'equals', right: 'approved' }),
      node(ids.trueAction, 'http_request', { url: 'https://example.com/yes', method: 'GET' }),
      node(ids.falseAction, 'http_request', { url: 'https://example.com/no', method: 'GET' }),
    ],
    connections: [
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0011', ids.trigger, ids.condition),
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0012', ids.condition, ids.trueAction, 'true'),
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0013', ids.condition, ids.falseAction, 'false'),
    ],
  };
  const requested: string[] = [];
  const result = await executeWorkflowGraph(graph, { body: { status: 'approved' } }, {
    request: async (url) => { requested.push(url); return fakeHttpResponse; },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(requested, ['https://example.com/yes']);
  assert.equal(result.logs.find((log) => log.nodeId === ids.falseAction)?.status, 'skipped');

  requested.length = 0;
  const falseResult = await executeWorkflowGraph(graph, { body: { status: 'rejected' } }, {
    request: async (url) => { requested.push(url); return fakeHttpResponse; },
  });
  assert.equal(falseResult.status, 'completed');
  assert.deepEqual(requested, ['https://example.com/no']);
  assert.equal(falseResult.logs.find((log) => log.nodeId === ids.trueAction)?.status, 'skipped');
});

test('filter output is typed into a downstream JSON webhook body without logging payload values', async () => {
  const graph: WorkflowGraphInput = {
    nodes: [
      node(ids.trigger, 'manual_trigger'),
      node(ids.filter, 'filter', { arrayPath: 'trigger.body.items', fieldPath: 'status', operator: 'equals', value: 'open' }),
      node(ids.condition, 'condition', { left: '{{steps.c18b6c07-750c-4be1-a1e0-8b1a5f2e0002.count}}', operator: 'greater_than', right: '0' }),
      node(ids.trueAction, 'webhook_action', {
        url: 'https://example.com/notify',
        body: '{"items":"{{steps.c18b6c07-750c-4be1-a1e0-8b1a5f2e0002.items}}"}',
      }),
      node(ids.falseAction, 'webhook_action', { url: 'https://example.com/empty' }),
    ],
    connections: [
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0021', ids.trigger, ids.filter),
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0022', ids.filter, ids.condition),
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0023', ids.condition, ids.trueAction, 'true'),
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0024', ids.condition, ids.falseAction, 'false'),
    ],
  };
  let sentBody: string | undefined;
  const result = await executeWorkflowGraph(graph, {
    body: { items: [{ status: 'open', subject: 'first' }, { status: 'closed', subject: 'second' }] },
  }, {
    request: async (_url, method, body) => {
      assert.equal(method, 'POST');
      sentBody = body;
      return fakeHttpResponse;
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(JSON.parse(sentBody ?? '{}'), { items: [{ status: 'open', subject: 'first' }] });
  assert.equal(JSON.stringify(result.logs).includes('first'), false);
  assert.equal(JSON.stringify(result.logs).includes('second'), false);
});

test('unsupported AI nodes fail safely without logging prompts or exception details', async () => {
  const graph: WorkflowGraphInput = {
    nodes: [node(ids.trigger, 'manual_trigger'), node(ids.ai, 'gemini_ai', { prompt: 'never log this private prompt' })],
    connections: [edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0031', ids.trigger, ids.ai)],
  };
  const result = await executeWorkflowGraph(graph, {});

  assert.equal(result.status, 'failed');
  assert.equal(result.logs.find((log) => log.nodeId === ids.ai)?.status, 'error');
  assert.equal(JSON.stringify(result).includes('never log this private prompt'), false);
});

test('cyclic graphs fail before any node is executed', async () => {
  const graph: WorkflowGraphInput = {
    nodes: [node(ids.trigger, 'manual_trigger'), node(ids.condition, 'condition', { left: 'a', operator: 'equals', right: 'a' })],
    connections: [
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0041', ids.trigger, ids.condition),
      edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0042', ids.condition, ids.trigger),
    ],
  };
  const result = await executeWorkflowGraph(graph, {});
  assert.equal(result.status, 'failed');
  assert.equal(result.logs.length, 0);
});

test('trigger logs retain only a field count, never submitted input keys or values', () => {
  const summary = summarizeTriggerInput({ password: 'sensitive-value', 'secret-value-as-a-key': 'another-secret' });
  assert.deepEqual(summary, { received: true, topLevelFieldCount: 2 });
});

test('template traversal is own-property-only and resolved JSON objects cannot mutate prototypes', () => {
  const context = { trigger: { body: { status: 'open' } }, steps: {} };
  assert.equal(resolveTemplate('{{trigger.body.status}}', context), 'open');
  assert.throws(() => readExecutionPath(context, 'trigger.body.__proto__'));
  assert.throws(() => readExecutionPath(context, 'trigger.body.constructor.prototype'));
  const input = JSON.parse('{"__proto__":{"polluted":true},"message":"{{trigger.body.status}}"}') as Record<string, unknown>;
  const resolved = resolveTemplate(input, context) as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(resolved), null);
  assert.equal(Object.prototype.hasOwnProperty.call(resolved, '__proto__'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(resolved)), JSON.parse('{"__proto__":{"polluted":true},"message":"open"}'));
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test('outbound destinations require public HTTPS on port 443 with no URL credentials', () => {
  assert.equal(validateOutboundUrl('https://example.com/path').hostname, 'example.com');
  for (const url of [
    'http://example.com',
    'https://example.com:8443',
    'https://user:pass@example.com',
    'https://localhost',
    'https://service.internal',
    'https://127.0.0.1',
    'https://[::1]',
  ]) {
    assert.throws(() => validateOutboundUrl(url), OutboundRequestError);
  }
});

test('IP classification rejects private, link-local, reserved, mapped, and mixed DNS answers', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '100.64.0.1', '169.254.169.254', '192.0.2.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', '::ffff:127.0.0.1']) {
    assert.equal(isPublicUnicastAddress(address), false, address);
  }
  assert.equal(isPublicUnicastAddress('8.8.8.8'), true);
  assert.equal(isPublicUnicastAddress('2606:4700:4700::1111'), true);
  assert.throws(() => assertPublicResolvedAddresses([
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]), OutboundRequestError);
  assert.deepEqual(assertPublicResolvedAddresses([{ address: '8.8.8.8', family: 4 }]), { address: '8.8.8.8', family: 4 });
});

test('outbound body limits apply before DNS and DNS stalls time out without opening a connection', async () => {
  let resolverCalled = false;
  await assert.rejects(
    sendPublicHttpsRequest('https://example.com', 'POST', 'x'.repeat(32 * 1024 + 1), 100, async () => {
      resolverCalled = true;
      return [{ address: '8.8.8.8', family: 4 }];
    }),
    OutboundRequestError,
  );
  assert.equal(resolverCalled, false);

  await assert.rejects(
    sendPublicHttpsRequest('https://example.com', 'GET', undefined, 5, async () => new Promise(() => undefined)),
    /DNS resolution timed out/,
  );
});
