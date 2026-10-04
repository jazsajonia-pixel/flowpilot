import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { AIProvider } from '../src/types/ai';
import type { WorkflowGraphInput } from '../src/server/workflows/graph-validation';
import { AIProviderError } from '../src/server/ai/gemini-provider';
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

test('AI nodes fail safely when the server Gemini provider is not configured', async () => {
  const graph: WorkflowGraphInput = {
    nodes: [node(ids.trigger, 'manual_trigger'), node(ids.ai, 'gemini_ai', { prompt: 'never log this private prompt' })],
    connections: [edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0031', ids.trigger, ids.ai)],
  };
  const missingProvider: AIProvider = {
    id: 'test',
    name: 'Test provider',
    generateCompletion: async () => { throw new AIProviderError('The built-in Gemini provider is not configured.'); },
  };
  const result = await executeWorkflowGraph(graph, {}, { aiProvider: missingProvider });

  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'The built-in Gemini provider is not configured.');
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

test('all Phase 5 AI node types resolve templates, parse structured results, and keep content out of logs', async () => {
  const extractionSchema = JSON.stringify({
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    additionalProperties: false,
  });
  const genericSchema = JSON.stringify({
    type: 'object',
    properties: { response: { type: 'string' } },
    required: ['response'],
    additionalProperties: false,
  });
  const cases: Array<{
    category: string;
    config: Record<string, unknown>;
    response: string;
    outputFormat: 'text' | 'json';
  }> = [
    {
      category: 'gemini_ai',
      config: { prompt: 'Process {{trigger.body.message}}', outputFormat: 'json', responseSchema: genericSchema },
      response: '{"response":"private generated response"}',
      outputFormat: 'json',
    },
    {
      category: 'ai_generation',
      config: { prompt: 'Reply to {{trigger.body.message}}' },
      response: 'private generated response',
      outputFormat: 'text',
    },
    {
      category: 'ai_classification',
      config: { input: '{{trigger.body.message}}', labels: ['billing', 'support'] },
      response: '{"label":"support","confidence":0.9}',
      outputFormat: 'json',
    },
    {
      category: 'ai_extraction',
      config: { input: '{{trigger.body.message}}', responseSchema: extractionSchema },
      response: '{"name":"private extracted value"}',
      outputFormat: 'json',
    },
    {
      category: 'ai_summarization',
      config: { input: '{{trigger.body.message}}', style: 'bullets' },
      response: 'private generated response',
      outputFormat: 'text',
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    let capturedPrompt = '';
    let capturedFormat: 'text' | 'json' | undefined;
    const provider: AIProvider = {
      id: 'test-provider',
      name: 'Test provider',
      generateCompletion: async (input) => {
        capturedPrompt = input.prompt;
        capturedFormat = input.outputFormat;
        return {
          text: fixture.response,
          model: 'gemini-3.8-flash',
          usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
        };
      },
    };
    const graph: WorkflowGraphInput = {
      nodes: [node(ids.trigger, 'manual_trigger'), node(ids.ai, fixture.category, fixture.config)],
      connections: [edge(`c18b6c07-750c-4be1-a1e0-8b1a5f2e01${String(index + 1).padStart(2, '0')}`, ids.trigger, ids.ai)],
    };
    const result = await executeWorkflowGraph(graph, { body: { message: 'private source text' } }, { aiProvider: provider });

    assert.equal(result.status, 'completed', fixture.category);
    assert.equal(capturedPrompt.includes('private source text'), true, fixture.category);
    assert.equal(capturedFormat, fixture.outputFormat, fixture.category);
    assert.equal(JSON.stringify(result).includes('private source text'), false, fixture.category);
    assert.equal(JSON.stringify(result).includes('private generated response'), false, fixture.category);
    assert.equal(JSON.stringify(result).includes('private extracted value'), false, fixture.category);
    assert.deepEqual(result.logs.find((log) => log.nodeId === ids.ai)?.outputData && (result.logs.find((log) => log.nodeId === ids.ai)?.outputData as Record<string, unknown>).model, 'gemini-3.8-flash');
  }
});

test('workflow execution resolves BYO provider selections only when the AI node is reached', async () => {
  const selectionCalls: Array<{ provider: string; credentialId?: string; model?: string }> = [];
  const provider: AIProvider = {
    id: 'test-openai',
    name: 'Test OpenAI',
    generateCompletion: async (input) => ({ text: 'private AI result', model: input.model ?? 'gpt-6-luna' }),
  };
  const graph: WorkflowGraphInput = {
    nodes: [
      node(ids.trigger, 'manual_trigger'),
      node(ids.ai, 'ai_generation', {
        provider: 'openai',
        credentialId: 'c1d6b0d0-2ce8-4f58-8e60-59f249c33971',
        model: 'gpt-6-luna',
        prompt: 'Generate a reply to {{trigger.body.message}}',
      }),
    ],
    connections: [edge('c18b6c07-750c-4be1-a1e0-8b1a5f2e0031', ids.trigger, ids.ai)],
  };

  const result = await executeWorkflowGraph(graph, { body: { message: 'private source' } }, {
    resolveAIProvider: async (selection) => {
      selectionCalls.push(selection);
      return provider;
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(selectionCalls, [{ provider: 'openai', credentialId: 'c1d6b0d0-2ce8-4f58-8e60-59f249c33971', model: 'gpt-6-luna' }]);
  assert.equal(JSON.stringify(result).includes('private AI result'), false);
  assert.equal(JSON.stringify(result).includes('private source'), false);
});
