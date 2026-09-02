import {
  compileCapabilityFrontier,
  requiredCapability,
  type AgentDelegation,
  type CapabilityId,
} from '@attune/command-bus';
import type { AttuneCommandType, AttuneRole, AttuneWorkspace } from '@attune/domain';

export type AgentDelegationStatus =
  | { readonly status: 'required'; readonly authorityEpoch: number }
  | { readonly status: 'expired'; readonly authorityEpoch: number; readonly expiresAt: string }
  | {
      readonly status: 'revalidation_required';
      readonly authorityEpoch: number;
      readonly expiresAt: string;
    }
  | { readonly status: 'active'; readonly authorityEpoch: number; readonly expiresAt: string };

export const AGENT_DELEGATION_LEASE_MS = 10 * 60 * 1000;
export const AGENT_ACCESS_CONSENT_MS = 12 * 60 * 60 * 1000;

function roleCanPossessCapability(
  workspace: AttuneWorkspace,
  role: AttuneRole,
  capabilityId: CapabilityId,
): boolean {
  const entry = compileCapabilityFrontier(workspace, role).find(({ id }) => id === capabilityId);
  return Boolean(entry && !entry.blockers.some(({ code }) => code === 'ROLE_REQUIRED'));
}

export function capabilityIdsForWorkspaceAuthority(
  workspace: AttuneWorkspace,
  roles: readonly AttuneRole[],
): readonly CapabilityId[] {
  const ids = new Set<CapabilityId>();
  for (const role of roles) {
    for (const entry of compileCapabilityFrontier(workspace, role)) {
      if (!entry.blockers.some(({ code }) => code === 'ROLE_REQUIRED')) ids.add(entry.id);
    }
  }
  return [...ids].toSorted();
}

export function availableCapabilityIdsForWorkspaceAuthority(
  workspace: AttuneWorkspace,
  roles: readonly AttuneRole[],
): readonly CapabilityId[] {
  const ids = new Set<CapabilityId>();
  for (const role of roles) {
    for (const entry of compileCapabilityFrontier(workspace, role)) {
      if (entry.available) ids.add(entry.id);
    }
  }
  return [...ids].toSorted();
}

export function authorityRoleForCommand(
  workspace: AttuneWorkspace,
  roles: readonly AttuneRole[],
  commandType: AttuneCommandType,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
): AttuneRole {
  const required = requiredCapability(commandType);
  if (!required) return perspective;
  const preferred = roles.includes(perspective) ? perspective : undefined;
  if (preferred && roleCanPossessCapability(workspace, preferred, required)) return preferred;
  const authorityRole = roles.find((role) => roleCanPossessCapability(workspace, role, required));
  if (!authorityRole) throw new Error('WORKSPACE_ROLE_REQUIRED');
  return authorityRole;
}

export function delegationStatus(
  delegation: AgentDelegation | null,
  authorityEpoch: number,
  now = Date.now(),
): AgentDelegationStatus {
  if (!delegation || delegation.revokedAt) return { status: 'required', authorityEpoch };
  if (delegation.authorityEpoch !== authorityEpoch) {
    return {
      status: 'revalidation_required',
      authorityEpoch: delegation.authorityEpoch,
      expiresAt: delegation.expiresAt,
    };
  }
  if (Date.parse(delegation.consentExpiresAt) <= now) {
    return {
      status: 'expired',
      authorityEpoch: delegation.authorityEpoch,
      expiresAt: delegation.expiresAt,
    };
  }
  return {
    status: 'active',
    authorityEpoch: delegation.authorityEpoch,
    expiresAt: delegation.expiresAt,
  };
}

export function delegationLeaseExpired(delegation: AgentDelegation, now = Date.now()): boolean {
  return Date.parse(delegation.expiresAt) <= now;
}
