import type { AttuneRole, CommandOrigin } from '@attune/domain';

import type { AttuneCommandErrorCode } from './errors';
import type { TrustedExecutionContext, TrustedExecutionPath } from './types';

interface AuthorizationFailure {
  readonly code: AttuneCommandErrorCode;
  readonly message: string;
}

const ORIGIN_BY_PATH: Readonly<Record<TrustedExecutionPath, CommandOrigin>> = {
  human: 'human_ui',
  webmcp: 'webmcp',
  solver: 'solver',
  provider: 'provider',
  shopify: 'shopify_verification',
};

const ROLE_BY_PATH: Readonly<Record<TrustedExecutionPath, AttuneRole>> = {
  human: 'buyer',
  webmcp: 'agent',
  solver: 'agent',
  provider: 'provider',
  shopify: 'agent',
};

const PRINCIPAL_PREFIX_BY_PATH: Readonly<Record<TrustedExecutionPath, string>> = {
  human: 'buyer:',
  webmcp: 'agent:',
  solver: 'solver:',
  provider: 'provider:',
  shopify: 'integration:',
};

export function originForPath(path: TrustedExecutionPath): CommandOrigin {
  return ORIGIN_BY_PATH[path];
}

export function authorizationFailure(
  context: TrustedExecutionContext,
): AuthorizationFailure | undefined {
  if (ROLE_BY_PATH[context.path] !== context.role) {
    return {
      code: 'ROLE_MISMATCH',
      message: `Execution path ${context.path} cannot assert role ${context.role}.`,
    };
  }
  if (!context.principalId.startsWith(PRINCIPAL_PREFIX_BY_PATH[context.path])) {
    return {
      code: 'PRINCIPAL_MISMATCH',
      message: `Execution path ${context.path} cannot assert this principal.`,
    };
  }
  return undefined;
}
