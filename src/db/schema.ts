import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Application schema through Phase 2C; Phases 4-6 use the execution and encrypted-credential tables defined here.
 * Long-running execution infrastructure remains later work.
 */

export const executionStatusEnum = pgEnum('execution_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const executionLogStatusEnum = pgEnum('execution_log_status', [
  'success',
  'error',
  'skipped',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    // Nullable to allow safe upgrades for any identity rows created before Phase 2C.
    passwordHash: text('password_hash'),
    displayName: varchar('display_name', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Store only the SHA-256 verifier, never the cookie's bearer token.
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_expires_at_idx').on(table.userId, table.expiresAt),
  ],
);

export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('workflows_owner_id_idx').on(table.ownerId)],
);

export const workflowNodes = pgTable(
  'nodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 32 }).notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    label: varchar('label', { length: 200 }).notNull(),
    position: jsonb('position').$type<{ x: number; y: number }>().notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('nodes_workflow_id_idx').on(table.workflowId),
    // Supports composite foreign keys so a connection cannot cross workflows.
    unique('nodes_workflow_id_id_unique').on(table.workflowId, table.id),
  ],
);

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    sourceNodeId: uuid('source_node_id').notNull(),
    sourceHandle: varchar('source_handle', { length: 128 }),
    targetNodeId: uuid('target_node_id').notNull(),
    targetHandle: varchar('target_handle', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('connections_workflow_id_idx').on(table.workflowId),
    index('connections_source_node_id_idx').on(table.sourceNodeId),
    index('connections_target_node_id_idx').on(table.targetNodeId),
    foreignKey({
      name: 'connections_source_node_workflow_fk',
      columns: [table.workflowId, table.sourceNodeId],
      foreignColumns: [workflowNodes.workflowId, workflowNodes.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'connections_target_node_workflow_fk',
      columns: [table.workflowId, table.targetNodeId],
      foreignColumns: [workflowNodes.workflowId, workflowNodes.id],
    }).onDelete('cascade'),
  ],
);

export const executions = pgTable(
  'executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Keep execution history intact; the restrictive foreign key blocks workflow deletion while runs exist.
    workflowId: uuid('workflow_id').notNull().references(() => workflows.id),
    status: executionStatusEnum('status').default('pending').notNull(),
    triggerData: jsonb('trigger_data').$type<unknown>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('executions_workflow_created_at_idx').on(table.workflowId, table.createdAt),
    index('executions_status_idx').on(table.status),
  ],
);

export const executionLogs = pgTable(
  'execution_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    // Historical node IDs intentionally are not foreign keys; workflow edits must not erase logs.
    nodeId: uuid('node_id').notNull(),
    status: executionLogStatusEnum('status').notNull(),
    inputData: jsonb('input_data').$type<unknown>(),
    outputData: jsonb('output_data').$type<unknown>(),
    error: text('error'),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('execution_logs_execution_timestamp_idx').on(table.executionId, table.timestamp)],
);

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 100 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    status: varchar('status', { length: 32 }).default('disconnected').notNull(),
    // Non-secret integration metadata only; secrets belong in credentials.encrypted_payload.
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('integrations_owner_provider_name_unique').on(
      table.ownerId,
      table.provider,
      table.name,
    ),
    unique('integrations_id_owner_id_unique').on(table.id, table.ownerId),
    index('integrations_owner_id_idx').on(table.ownerId),
  ],
);

export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id'),
    provider: varchar('provider', { length: 100 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    // AES-256-GCM envelope only; plaintext provider keys never belong in this table.
    encryptedPayload: text('encrypted_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('credentials_owner_provider_idx').on(table.ownerId, table.provider),
    index('credentials_integration_id_idx').on(table.integrationId),
    foreignKey({
      name: 'credentials_integration_owner_fk',
      columns: [table.integrationId, table.ownerId],
      foreignColumns: [integrations.id, integrations.ownerId],
    }).onDelete('cascade'),
  ],
);
