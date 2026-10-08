import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { executeWorkflowGraph } from '../src/server/execution/engine';
import { workflowGraphSchema, type WorkflowGraphInput } from '../src/server/workflows/graph-validation';
import {
  MAX_RECORD_WRITES_PER_RUN,
  validateCollection,
  validateRecordData,
  validateRecordKey,
  withRunWriteLimit,
  type OwnerDataStore,
} from '../src/server/data/records';

const TRIGGER = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0001';
const ACTION = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0002';

function graph(category: 'create_db_record' | 'update_db_record', config: Record<string, unknown>, count = 1): WorkflowGraphInput {
  const actions = Array.from({ length: count }, (_, index) => ({
    id: count === 1 ? ACTION : `c18b6c07-750c-4be1-a1e0-8b1a5f2e01${String(index).padStart(2, '0')}`,
    type: 'action', category, label: 'Record', position: { x: 0, y: 0 }, config,
  }));
  return workflowGraphSchema.parse({
    nodes: [{ id: TRIGGER, type: 'trigger', category: 'manual_trigger', label: 'Start', position: { x: 0, y: 0 }, config: {} }, ...actions],
    connections: actions.map((action, index) => ({ id: `c18b6c07-750c-4be1-a1e0-8b1a5f2e02${String(index).padStart(2, '0')}`, sourceNodeId: TRIGGER, targetNodeId: action.id })),
  });
}

function memoryStore(limit = 1_000) {
  const rows = new Map<string, Record<string, unknown>>();
  const store: OwnerDataStore = {
    create: async (collection, key, data) => {
      const id = `${collection}/${key}`;
      if (rows.has(id)) return 'exists';
      if (rows.size >= limit) return 'limit';
      rows.set(id, data);
      return 'created';
    },
    update: async (collection, key, data, mode) => {
      const id = `${collection}/${key}`;
      const existing = rows.get(id);
      if (!existing) return false;
      rows.set(id, mode === 'merge' ? { ...existing, ...data } : data);
      return true;
    },
  };
  return { store: withRunWriteLimit(store), rows };
}

test('record config validation accepts drafts and rejects bad collections or extra fields', () => {
  const ok = (category: string, config: Record<string, unknown>) => workflowGraphSchema.safeParse({ nodes: [{ id: ACTION, type: 'action', category, label: 'R', position: { x: 0, y: 0 }, config }], connections: [] }).success;
  assert.equal(ok('create_db_record', {}), true);
  assert.equal(ok('create_db_record', { collection: 'leads', key: '{{trigger.email}}', data: '{"a":1}' }), true);
  assert.equal(ok('create_db_record', { collection: 'Bad Name' }), false);
  assert.equal(ok('create_db_record', { collection: 'leads', ownerId: 'x' }), false);
  assert.equal(ok('update_db_record', { collection: 'leads', mode: 'replace' }), true);
  assert.equal(ok('update_db_record', { mode: 'upsert' }), false);
});

test('validators bound collections, keys, and data', () => {
  assert.equal(validateCollection('leads_2026'), 'leads_2026');
  assert.throws(() => validateCollection('../users'));
  assert.equal(validateRecordKey(' ada@example.test\n'), 'ada@example.test');
  assert.equal(validateRecordKey(42), '42');
  assert.throws(() => validateRecordKey(''));
  assert.throws(() => validateRecordKey('k'.repeat(129)));
  assert.throws(() => validateRecordData([1, 2]));
  assert.throws(() => validateRecordData({ big: 'x'.repeat(17 * 1024) }));
});

test('create renders templates, stores the record, and logs no data', async () => {
  const { store, rows } = memoryStore();
  const result = await executeWorkflowGraph(
    graph('create_db_record', { collection: 'leads', key: '{{trigger.email}}', data: '{"name": "{{trigger.name}}", "score": "{{trigger.score}}"}' }),
    { email: 'ada@example.test', name: 'Ada', score: 9 },
    { dataStore: store },
  );
  assert.equal(result.status, 'completed');
  assert.deepEqual(rows.get('leads/ada@example.test'), { name: 'Ada', score: 9 });
  assert.deepEqual(result.logs.find((log) => log.nodeId === ACTION)?.outputData, { created: true });
  assert.equal(JSON.stringify(result.logs).includes('ada@example.test'), false);
});

test('create without a key generates a random ID; duplicates and limits fail with fixed messages', async () => {
  const { store, rows } = memoryStore(1);
  const first = await executeWorkflowGraph(graph('create_db_record', { collection: 'notes', data: '{"a":1}' }), {}, { dataStore: store });
  assert.equal(first.status, 'completed');
  assert.match([...rows.keys()][0], /^notes\/[0-9a-f-]{36}$/);
  const limited = await executeWorkflowGraph(graph('create_db_record', { collection: 'notes', key: 'k', data: '{"a":1}' }), {}, { dataStore: memoryStore(0).store });
  assert.equal(limited.error, 'Record limit reached for this account.');
  const dup = memoryStore();
  await executeWorkflowGraph(graph('create_db_record', { collection: 'notes', key: 'k', data: '{"a":1}' }), {}, { dataStore: dup.store });
  const again = await executeWorkflowGraph(graph('create_db_record', { collection: 'notes', key: 'k', data: '{"a":2}' }), {}, { dataStore: dup.store });
  assert.equal(again.error, 'A record with this key already exists.');
});

test('update merges or replaces and fails when the record is missing', async () => {
  const { store, rows } = memoryStore();
  rows.set('leads/ada', { name: 'Ada', status: 'new' });
  const merged = await executeWorkflowGraph(graph('update_db_record', { collection: 'leads', key: 'ada', data: '{"status": "{{trigger.status}}"}' }), { status: 'won' }, { dataStore: store });
  assert.equal(merged.status, 'completed');
  assert.deepEqual(rows.get('leads/ada'), { name: 'Ada', status: 'won' });
  await executeWorkflowGraph(graph('update_db_record', { collection: 'leads', key: 'ada', mode: 'replace', data: '{"only": true}' }), {}, { dataStore: store });
  assert.deepEqual(rows.get('leads/ada'), { only: true });
  const missing = await executeWorkflowGraph(graph('update_db_record', { collection: 'leads', key: 'nobody', data: '{"a":1}' }), {}, { dataStore: store });
  assert.equal(missing.error, 'Record not found.');
});

test('invalid data, missing store, and the per-run write cap fail closed', async () => {
  const bad = await executeWorkflowGraph(graph('create_db_record', { collection: 'leads', data: '[1,2]' }), {}, { dataStore: memoryStore().store });
  assert.equal(bad.error, 'Record data must be a JSON object up to 16 KiB.');
  const none = await executeWorkflowGraph(graph('create_db_record', { collection: 'leads', data: '{"a":1}' }), {}, {});
  assert.equal(none.error, 'Database records are not available for this run.');
  const { store, rows } = memoryStore();
  const capped = await executeWorkflowGraph(graph('create_db_record', { collection: 'bulk', data: '{"a":1}' }, MAX_RECORD_WRITES_PER_RUN + 1), {}, { dataStore: store });
  assert.equal(capped.error, 'Record write limit reached for this run.');
  assert.equal(rows.size, MAX_RECORD_WRITES_PER_RUN);
});
