import { requiredCapability } from '@attune/capabilities';
import type { AttuneCommand, CommandOrigin } from '@attune/domain';

import type { AttuneCommandErrorCode } from './errors';
import type { TrustedExecutionContext, TrustedExecutionPath } from './types';

interface AuthorizationFailure {
  readonly code: AttuneCommandErrorCode;
  readonly message: string;
}

const ORIGIN_BY_PATH: Readonly<Record<TrustedExecutionPath, CommandOrigin>> = {
  human: 'human_ui',
  webmcp: 'webmcp',
  system: 'system',
  shopify_webhook: 'shopify_webhook',
  shopify_reconciliation: 'shopify_reconciliation',
};

export function originForPath(path: TrustedExecutionPath): CommandOrigin {
  return ORIGIN_BY_PATH[path];
}

function principalMatches(context: TrustedExecutionContext): boolean {
  switch (context.path) {
    case 'human':
    case 'webmcp':
      return context.principalId.startsWith('user:') || context.principalId.startsWith('judge:');
    case 'system':
      return (
        context.principalId.startsWith('system:') || context.principalId.startsWith('integration:')
      );
    case 'shopify_webhook':
      return context.principalId.startsWith('shopify:webhook:');
    case 'shopify_reconciliation':
      return context.principalId.startsWith('shopify:reconciliation:');
    default:
      return false;
  }
}

function delegationFailure(
  context: TrustedExecutionContext,
  commandType: AttuneCommand['type'],
  now: string,
  authorityEpoch: number,
): AuthorizationFailure | undefined {
  const grant = context.delegation;
  if (!grant) {
    return {
      code: 'DELEGATION_REQUIRED',
      message: 'A WebMCP invocation requires an active server-issued delegation grant.',
    };
  }
  if (grant.workspaceId !== context.workspaceId || grant.principalId !== context.principalId) {
    return {
      code: 'DELEGATION_INVALID',
      message: 'The delegation does not match this workspace and authenticated principal.',
    };
  }
  if (grant.revokedAt) {
    return { code: 'DELEGATION_REVOKED', message: 'The active delegation has been revoked.' };
  }
  if (Date.parse(grant.expiresAt) <= Date.parse(now)) {
    return { code: 'DELEGATION_EXPIRED', message: 'The active delegation has expired.' };
  }
  if (grant.authorityEpoch !== authorityEpoch) {
    return {
      code: 'REVALIDATION_REQUIRED',
      message: `Workspace authority changed from epoch ${grant.authorityEpoch} to ${authorityEpoch}.`,
    };
  }
  const required = requiredCapability(commandType);
  if (required && !grant.capabilityIds.includes(required)) {
    return {
      code: 'DELEGATION_CAPABILITY_DENIED',
      message: `The active delegation does not include ${required}.`,
    };
  }
  return undefined;
}

export function authorizationFailure(
  context: TrustedExecutionContext,
  commandType: AttuneCommand['type'],
  now: string,
  authorityEpoch: number,
): AuthorizationFailure | undefined {
  const externalSync = commandType === 'synchronize_shopify_draft_order';
  const externalPath =
    context.path === 'shopify_webhook' || context.path === 'shopify_reconciliation';
  if (externalSync !== externalPath) {
    return {
      code: 'ORIGIN_NOT_ALLOWED',
      message: externalSync
        ? 'Shopify Draft Order synchronization requires a verified webhook or reconciliation path.'
        : 'Shopify synchronization paths cannot execute product commands.',
    };
  }
  if (!principalMatches(context)) {
    return {
      code: 'PRINCIPAL_MISMATCH',
      message: `Execution path ${context.path} cannot assert this principal.`,
    };
  }
  if (context.path === 'webmcp') {
    return delegationFailure(context, commandType, now, authorityEpoch);
  }
  if (context.delegation) {
    return {
      code: 'DELEGATION_INVALID',
      message: 'Delegation grants are valid only on the WebMCP execution path.',
    };
  }
  return undefined;
}
