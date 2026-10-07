import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { workflowOwnerScope } from '../src/server/workflows/ownership';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  workflowIdSchema,
} from '../src/server/workflows/validation';

const workflowId = '9d4a9c3d-3e7e-4a2b-8f2a-6c68edb55c51';
const ownerId = '6bc1a7f6-3eaf-4ec0-a28b-a0c72cfe9d05';

test('workflow create accepts only editable fields and normalizes whitespace', () => {
  const valid = createWorkflowSchema.safeParse({ title: '  Daily digest  ', description: '  Sends a digest  ' });
  const emptyTitle = createWorkflowSchema.safeParse({ title: '   ' });
  const forgedOwner = createWorkflowSchema.safeParse({ title: 'Test', ownerId });
  const forgedActiveState = createWorkflowSchema.safeParse({ title: 'Test', isActive: true });

  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.title, 'Daily digest');
    assert.equal(valid.data.description, 'Sends a digest');
  }
  assert.equal(emptyTitle.success, false);
  assert.equal(forgedOwner.success, false);
  assert.equal(forgedActiveState.success, false);
});

test('workflow update requires at least one supported field and rejects ownership changes', () => {
  assert.equal(updateWorkflowSchema.safeParse({ title: 'Updated title' }).success, true);
  assert.equal(updateWorkflowSchema.safeParse({ description: null }).success, true);
  assert.equal(updateWorkflowSchema.safeParse({ isActive: true }).success, true);
  assert.equal(updateWorkflowSchema.safeParse({}).success, false);
  assert.equal(updateWorkflowSchema.safeParse({ ownerId }).success, false);
  assert.equal(updateWorkflowSchema.safeParse({ webhookToken: 'forged-token' }).success, false);
  assert.equal(updateWorkflowSchema.safeParse({ title: 'x'.repeat(201) }).success, false);
});

test('workflow path IDs must be UUIDs', () => {
  assert.equal(workflowIdSchema.safeParse(workflowId).success, true);
  assert.equal(workflowIdSchema.safeParse('not-a-uuid').success, false);
});

test('item owner scope compiles to predicates for both workflow ID and session owner ID', () => {
  const query = new PgDialect().sqlToQuery(workflowOwnerScope(workflowId, ownerId)!);
  assert.match(query.sql, /"workflows"\."id"\s*=\s*\$1/);
  assert.match(query.sql, /"workflows"\."owner_id"\s*=\s*\$2/);
  assert.deepEqual(query.params, [workflowId, ownerId]);
});
