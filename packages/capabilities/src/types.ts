import type { AttuneRole, AttuneWorkspace } from '@attune/domain';

export type CapabilityId =
  | 'compare_valid_changes'
  | 'apply_deterministic_repair'
  | 'edit_draft'
  | 'request_quote'
  | 'request_changes'
  | 'freeze_and_quote_revision'
  | 'accept_revision'
  | 'materialize_for_commerce'
  | 'navigate_to_storefront';

export type CapabilityBlockerCode =
  | 'ROLE_REQUIRED'
  | 'SPECIFICATION_INVALID'
  | 'NO_HARD_CONFLICT'
  | 'QUOTE_ALREADY_REQUESTED'
  | 'MANUFACTURING_REQUEST_MISSING'
  | 'QUOTE_REQUEST_MISSING'
  | 'QUOTE_ALREADY_EXISTS'
  | 'FROZEN_REVISION_MISSING'
  | 'ACCEPTANCE_ALREADY_EXISTS'
  | 'ACCEPTANCE_MISSING'
  | 'COMMERCE_ALREADY_VERIFIED'
  | 'COMMERCE_VERIFICATION_MISSING';

export interface CapabilityBlocker {
  readonly code: CapabilityBlockerCode;
  readonly message: string;
}

interface CapabilityBase {
  readonly id: CapabilityId;
  readonly capabilityEpoch: number;
  readonly description: string;
  readonly predictedConsequences: readonly string[];
}

export interface CompiledCapability extends CapabilityBase {
  readonly available: true;
  readonly reason: string;
  readonly blockers: readonly [];
}

export interface BlockedCapability extends CapabilityBase {
  readonly available: false;
  readonly reason: null;
  readonly blockers: readonly CapabilityBlocker[];
}

export type CapabilityFrontierEntry = CompiledCapability | BlockedCapability;

export interface CapabilityAuthority {
  readonly acceptance: AttuneWorkspace['acceptances'][number] | undefined;
  readonly commerce: AttuneWorkspace['commerceLinks'][number] | undefined;
  readonly quote: AttuneWorkspace['quotes'][number] | undefined;
  readonly request: AttuneWorkspace['quoteRequests'][number] | undefined;
  readonly revision: AttuneWorkspace['frozenRevisions'][number] | undefined;
  readonly revisionId: string;
  readonly specHash: string;
}

export interface CompilerContext {
  readonly workspace: AttuneWorkspace;
  readonly role: AttuneRole;
  readonly valid: boolean;
  readonly authority: CapabilityAuthority;
}

export interface CapabilityDefinition {
  readonly id: CapabilityId;
  readonly description: (context: CompilerContext) => string;
  readonly predictedConsequences: (context: CompilerContext) => readonly string[];
  readonly blockers: (context: CompilerContext) => readonly CapabilityBlocker[];
  readonly reason: (context: CompilerContext) => string;
}
