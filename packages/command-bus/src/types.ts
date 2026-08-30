import type {
  CapabilityFrontierEntry,
  CapabilityId,
  CompiledCapability,
} from '@attune/capabilities';
import type {
  AttuneCommand,
  AttuneRole,
  AttuneWorkspace,
  CommandOrigin,
  ValidationResult,
} from '@attune/domain';

import type { AttuneCommandErrorCode } from './errors';

export type TrustedExecutionPath = 'human' | 'webmcp' | 'solver' | 'provider' | 'shopify';

export interface TrustedExecutionContext {
  readonly path: TrustedExecutionPath;
  readonly principalId: string;
  readonly role: AttuneRole;
}

export interface CommandEnvelope {
  readonly commandId: string;
  readonly expectedWorkspaceSeq: number;
  readonly expectedCapabilityEpoch: number;
  readonly expectedSpecHash: string;
  readonly observationCursor?: number;
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
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly specHashBefore: string;
  readonly specHashAfter: string;
  readonly affectedEntities: readonly string[];
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
  readonly createdAt: string;
}

export interface CommandResult {
  readonly workspace: AttuneWorkspace;
  readonly receipt: ChangeReceipt;
  readonly capabilities: readonly CompiledCapability[];
  readonly frontier: readonly CapabilityFrontierEntry[];
  readonly observation: InterventionSummary;
}
