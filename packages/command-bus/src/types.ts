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

export interface DelegationGrant {
  readonly grantId: string;
  readonly delegatingPrincipalId: string;
  readonly delegatedPrincipalId: string;
  readonly role: AttuneRole;
  readonly workspaceId: string;
  readonly capabilityIds: readonly CapabilityId[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly observationCursor: number;
}

export interface TrustedExecutionContext {
  readonly path: TrustedExecutionPath;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly role: AttuneRole;
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
