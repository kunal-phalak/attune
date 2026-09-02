import type {
  CapabilityFrontierEntry,
  CapabilityId,
  CompiledCapability,
} from '@attune/capabilities';
import type {
  AttuneCommand,
  AttuneRole,
  AttuneWorkspace,
  CommandFootprint,
  CommandOrigin,
  ValidationResult,
} from '@attune/domain';

import type { AttuneCommandErrorCode } from './errors';
import type { ForecastConsequence } from './forecast/consequence';

export type TrustedExecutionPath =
  | 'human'
  | 'webmcp'
  | 'system'
  | 'shopify_webhook'
  | 'shopify_reconciliation';

export interface AgentDelegation {
  readonly id: string;
  readonly workspaceId: string;
  /** Authenticated human/account identity that explicitly enabled agent access. */
  readonly principalId: string;
  readonly capabilityIds: readonly CapabilityId[];
  /** Authority revision against which the server derived capabilityIds. */
  readonly authorityEpoch: number;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Consent is finite but may outlive one short-lived delegation lease. */
  readonly consentExpiresAt: string;
  readonly revokedAt: string | null;
  readonly observationCursor: number;
}

/** @deprecated Use AgentDelegation. */
export type DelegationGrant = AgentDelegation;

export interface TrustedExecutionContext {
  readonly path: TrustedExecutionPath;
  readonly workspaceId: string;
  readonly principalId: string;
  /** Capability role selected by the server for this command. */
  readonly role: AttuneRole;
  /** Product lens only; it is never consulted to authorize a command. */
  readonly perspective?: AttuneRole;
  /** Roles derived from workspace membership, never browser input. */
  readonly authorityRoles?: readonly AttuneRole[];
  readonly delegation?: DelegationGrant;
}

export interface CommandEnvelope {
  readonly commandId: string;
  readonly expectedWorkspaceSeq: number;
  readonly expectedCapabilityEpoch: number;
  readonly expectedAuthorityEpoch: number;
  readonly expectedSpecHash: string;
  readonly observationCursor?: number;
  readonly footprint?: CommandFootprint;
}

export interface CapabilityReference {
  readonly role: AttuneRole;
  readonly capabilityId: CapabilityId;
}

export interface CapabilityTransition {
  readonly transitionId: string;
  readonly receiptId: string;
  readonly workspaceSeq: number;
  readonly capabilityEpoch: number;
  readonly gained: readonly CapabilityReference[];
  readonly lost: readonly CapabilityReference[];
}

export interface ChangeReceipt {
  readonly receiptSeq: number;
  readonly receiptId: string;
  readonly commandId: string;
  readonly command: AttuneCommand['type'];
  readonly origin: CommandOrigin;
  readonly principalId: string;
  readonly role: AttuneRole;
  readonly delegationGrantId: string | null;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly specHashBefore: string;
  readonly specHashAfter: string;
  readonly affectedEntities: readonly string[];
  readonly rebasedFromWorkspaceSeq: number | null;
  readonly consequence: ForecastConsequence;
  readonly preservedLocks: readonly string[];
  readonly validationBefore: ValidationResult;
  readonly validationAfter: ValidationResult;
  readonly workspaceSeq: number;
  readonly draftVersion: number;
  readonly capabilityEpoch: number;
  readonly capabilityTransition: CapabilityTransition;
  readonly createdAt: string;
}

export interface InterventionSummary {
  readonly previousWorkspaceSeq: number;
  readonly currentWorkspaceSeq: number;
  readonly interventions: readonly Pick<
    ChangeReceipt,
    'receiptSeq' | 'origin' | 'command' | 'affectedEntities' | 'beforeHash' | 'afterHash'
  >[];
}

export interface CommandRejection {
  readonly rejectionId: string;
  readonly commandId: string;
  readonly command: AttuneCommand['type'];
  readonly origin: CommandOrigin;
  readonly principalId: string;
  readonly role: AttuneRole;
  readonly code: AttuneCommandErrorCode;
  readonly workspaceSeq: number;
  readonly capabilityEpoch: number;
  readonly currentSpecHash: string;
  readonly changedEntities: readonly string[];
  readonly createdAt: string;
}

export interface CommandResult {
  readonly workspace: AttuneWorkspace;
  readonly receipt: ChangeReceipt;
  readonly capabilities: readonly CompiledCapability[];
  readonly frontier: readonly CapabilityFrontierEntry[];
  readonly observation: InterventionSummary;
  readonly forecast: ForecastConsequence;
}
