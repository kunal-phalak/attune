import type {
  CapabilityTransition,
  ChangeReceipt,
  CommandRejection,
  CommandResult,
  AgentDelegation,
} from '@attune/command-bus';
import type {
  Acceptance,
  AttuneRole,
  AttuneWorkspace,
  BuyerCommerceProfile,
  CommerceLink,
  ExternalCommerceRecord,
  FrozenRevision,
  ManufacturingRequest,
  ProviderCapabilityProfile,
  Quote,
  QuoteRequest,
  ShopifyCustomerBinding,
} from '@attune/domain';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const createdAt = timestamp('created_at', { mode: 'string', withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp('updated_at', { mode: 'string', withTimezone: true })
  .notNull()
  .defaultNow();

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt,
});

export const users = pgTable(
  'attune_users',
  {
    id: text('id').primaryKey(),
    authUserId: text('auth_user_id').notNull(),
    email: text('email'),
    displayName: text('display_name').notNull(),
    createdAt,
  },
  (table) => [uniqueIndex('attune_users_auth_user_id_unique').on(table.authUserId)],
);

export const buyerCommerceProfiles = pgTable('buyer_commerce_profiles', {
  principalId: text('principal_id').primaryKey(),
  profile: jsonb('profile').$type<BuyerCommerceProfile>().notNull(),
  createdAt,
  updatedAt,
});

export const shopifyCustomerBindings = pgTable(
  'shopify_customer_bindings',
  {
    buyerPrincipalId: text('buyer_principal_id').notNull(),
    shopDomain: text('shop_domain').notNull(),
    customerId: text('customer_id').notNull(),
    defaultAddressId: text('default_address_id'),
    binding: jsonb('binding').$type<ShopifyCustomerBinding>().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.buyerPrincipalId, table.shopDomain] }),
    uniqueIndex('shopify_customer_bindings_customer_unique').on(
      table.shopDomain,
      table.customerId,
    ),
  ],
);

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    roles: text('roles').array().$type<AttuneRole[]>().notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  code: text('code').notNull(),
  createdAt,
  updatedAt,
});

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    commitmentId: text('commitment_id').notNull(),
    liveblocksRoomId: text('liveblocks_room_id').notNull(),
    currentSpecification: jsonb('current_specification').$type<AttuneWorkspace>().notNull(),
    workspaceSeq: integer('workspace_seq').notNull(),
    draftVersion: integer('draft_version').notNull(),
    capabilityEpoch: integer('capability_epoch').notNull(),
    needStartedAt: timestamp('need_started_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('workspaces_commitment_id_unique').on(table.commitmentId),
    uniqueIndex('workspaces_liveblocks_room_id_unique').on(table.liveblocksRoomId),
    index('workspaces_project_id_index').on(table.projectId),
  ],
);

export const workspaceFiles = pgTable(
  'workspace_files',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index('workspace_files_workspace_id_index').on(table.workspaceId)],
);

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    roles: text('roles').array().$type<AttuneRole[]>().notNull(),
    canComment: boolean('can_comment').notNull().default(true),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

export const providerCapabilityProfiles = pgTable(
  'provider_capability_profiles',
  {
    profileId: text('profile_id').notNull(),
    providerId: text('provider_id').notNull(),
    version: text('version').notNull(),
    profile: jsonb('profile').$type<ProviderCapabilityProfile>().notNull(),
    effectiveAt: timestamp('effective_at', { mode: 'string', withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.version] }),
    index('provider_capability_profiles_provider_index').on(table.providerId),
  ],
);

export const agentDelegations = pgTable(
  'agent_delegations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    principalId: text('principal_id').notNull(),
    capabilityIds: text('capability_ids')
      .array()
      .$type<AgentDelegation['capabilityIds']>()
      .notNull(),
    authorityEpoch: integer('authority_epoch').notNull(),
    observationCursor: integer('observation_cursor').notNull().default(0),
    issuedAt: timestamp('issued_at', { mode: 'string', withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }).notNull(),
    consentExpiresAt: timestamp('consent_expires_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'string', withTimezone: true }),
    createdAt,
  },
  (table) => [
    index('agent_delegations_workspace_principal_index').on(table.workspaceId, table.principalId),
  ],
);

export const workspaceSnapshots = pgTable(
  'workspace_snapshots',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    workspaceSeq: integer('workspace_seq').notNull(),
    specification: jsonb('specification').$type<AttuneWorkspace>().notNull(),
    specHash: text('spec_hash').notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex('workspace_snapshots_sequence_unique').on(table.workspaceId, table.workspaceSeq),
  ],
);

export const commandIdempotencyRecords = pgTable(
  'command_idempotency_records',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    commandId: text('command_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    principalId: text('principal_id').notNull(),
    role: text('role').$type<AttuneRole>().notNull(),
    result: jsonb('result').$type<CommandResult>().notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.commandId] })],
);

export const externalActionAttempts = pgTable(
  'external_action_attempts',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    commandId: text('command_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: text('status').$type<'in_progress' | 'completed' | 'failed'>().notNull(),
    failureCode: text('failure_code'),
    startedAt: timestamp('started_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt,
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.commandId] })],
);

export const changeReceipts = pgTable(
  'change_receipts',
  {
    receiptId: text('receipt_id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    receiptSeq: integer('receipt_seq').notNull(),
    commandId: text('command_id').notNull(),
    origin: text('origin').notNull(),
    principalId: text('principal_id').notNull(),
    role: text('role').$type<AttuneRole>().notNull(),
    beforeHash: text('before_hash').notNull(),
    afterHash: text('after_hash').notNull(),
    specificationBeforeHash: text('specification_before_hash').notNull(),
    specificationAfterHash: text('specification_after_hash').notNull(),
    receipt: jsonb('receipt').$type<ChangeReceipt>().notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex('change_receipts_sequence_unique').on(table.workspaceId, table.receiptSeq),
    uniqueIndex('change_receipts_command_unique').on(table.workspaceId, table.commandId),
    index('change_receipts_workspace_created_index').on(table.workspaceId, table.createdAt),
  ],
);

export const capabilityTransitions = pgTable(
  'capability_transitions',
  {
    transitionId: text('transition_id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => changeReceipts.receiptId),
    workspaceSeq: integer('workspace_seq').notNull(),
    capabilityEpoch: integer('capability_epoch').notNull(),
    transition: jsonb('transition').$type<CapabilityTransition>().notNull(),
    createdAt,
  },
  (table) => [index('capability_transitions_workspace_index').on(table.workspaceId)],
);

export const commandRejections = pgTable(
  'command_rejections',
  {
    rejectionId: text('rejection_id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    commandId: text('command_id').notNull(),
    rejection: jsonb('rejection').$type<CommandRejection>().notNull(),
    createdAt,
  },
  (table) => [index('command_rejections_workspace_index').on(table.workspaceId)],
);

export const frozenRevisions = pgTable(
  'frozen_revisions',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    revisionId: text('revision_id').notNull(),
    specHash: text('spec_hash').notNull(),
    canonicalSpecification: jsonb('canonical_specification').$type<FrozenRevision>().notNull(),
    liveblocksVersionId: text('liveblocks_version_id'),
    frozenAt: timestamp('frozen_at', { mode: 'string', withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.revisionId] })],
);

export const quoteRequests = pgTable('quote_requests', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  specHash: text('spec_hash').notNull(),
  draftVersion: integer('draft_version').notNull(),
  record: jsonb('record').$type<QuoteRequest>().notNull(),
  createdAt,
});

export const manufacturingRequests = pgTable('manufacturing_requests', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  revisionId: text('revision_id').notNull(),
  specHash: text('spec_hash').notNull(),
  status: text('status').notNull(),
  record: jsonb('record').$type<ManufacturingRequest>().notNull(),
  createdAt,
  updatedAt,
});

export const externalCommerceRecords = pgTable('external_commerce_records', {
  externalId: text('external_id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  requestId: text('request_id').notNull(),
  revisionId: text('revision_id').notNull(),
  specHash: text('spec_hash').notNull(),
  syncState: text('sync_state').notNull(),
  record: jsonb('record').$type<ExternalCommerceRecord>().notNull(),
  createdAt,
  updatedAt,
});

export const quotes = pgTable('quotes', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  revisionId: text('revision_id').notNull(),
  specHash: text('spec_hash').notNull(),
  record: jsonb('record').$type<Quote>().notNull(),
  createdAt,
});

export const acceptances = pgTable('acceptances', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  quoteId: text('quote_id').notNull(),
  revisionId: text('revision_id').notNull(),
  specHash: text('spec_hash').notNull(),
  record: jsonb('record').$type<Acceptance>().notNull(),
  createdAt,
});

export const commerceVerificationRecords = pgTable('commerce_verification_records', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  revisionId: text('revision_id').notNull(),
  specHash: text('spec_hash').notNull(),
  status: text('status').notNull(),
  record: jsonb('record').$type<CommerceLink>().notNull(),
  createdAt,
});

export const agentInterventionObservations = pgTable(
  'agent_intervention_observations',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    principalId: text('principal_id').notNull(),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => changeReceipts.receiptId),
    observedAt: timestamp('observed_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.principalId, table.receiptId] })],
);
