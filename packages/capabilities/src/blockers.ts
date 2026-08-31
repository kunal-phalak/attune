import type { AttuneRole } from '@attune/domain';

import type { CapabilityBlocker, CapabilityBlockerCode, CompilerContext } from './types';

function blocker(code: CapabilityBlockerCode, message: string): CapabilityBlocker {
  return { code, message };
}

function requireRole(context: CompilerContext, roles: readonly AttuneRole[]) {
  return roles.includes(context.role)
    ? []
    : [blocker('ROLE_REQUIRED', `Requires role: ${roles.join(' or ')}.`)];
}

export function editBlockers(context: CompilerContext) {
  return requireRole(context, ['buyer']);
}

export function conflictBlockers(context: CompilerContext) {
  return [
    ...requireRole(context, ['buyer']),
    ...(context.valid
      ? [blocker('NO_HARD_CONFLICT', 'The current specification has no hard conflict to repair.')]
      : []),
  ];
}

export function requestBlockers(context: CompilerContext) {
  const { authority, valid } = context;
  return [
    ...requireRole(context, ['buyer']),
    ...(!valid
      ? [blocker('SPECIFICATION_INVALID', 'Resolve every hard conflict before requesting a quote.')]
      : []),
    ...(authority.request
      ? [
          blocker(
            'QUOTE_ALREADY_REQUESTED',
            'This exact specification already has a quote request.',
          ),
        ]
      : []),
    ...(authority.quote
      ? [blocker('QUOTE_ALREADY_EXISTS', 'This exact specification is already quoted.')]
      : []),
  ];
}

export function quoteBlockers(context: CompilerContext) {
  const { authority } = context;
  return [
    ...requireRole(context, ['provider']),
    ...(!authority.request
      ? [blocker('QUOTE_REQUEST_MISSING', 'The current specification has no buyer quote request.')]
      : []),
    ...(authority.quote
      ? [blocker('QUOTE_ALREADY_EXISTS', 'The current specification is already frozen and quoted.')]
      : []),
  ];
}

export function acceptanceBlockers(context: CompilerContext) {
  const { authority } = context;
  return [
    ...requireRole(context, ['buyer']),
    ...(!authority.revision || !authority.quote
      ? [
          blocker(
            'FROZEN_REVISION_MISSING',
            'A provider must freeze and quote this exact specification first.',
          ),
        ]
      : []),
    ...(authority.acceptance
      ? [blocker('ACCEPTANCE_ALREADY_EXISTS', 'This exact frozen revision is already accepted.')]
      : []),
  ];
}

export function commerceBlockers(context: CompilerContext) {
  const { authority } = context;
  return [
    ...requireRole(context, ['provider']),
    ...(!authority.acceptance
      ? [
          blocker(
            'ACCEPTANCE_MISSING',
            'The exact current frozen revision has not been accepted by the buyer.',
          ),
        ]
      : []),
    ...(authority.commerce
      ? [
          blocker(
            'COMMERCE_ALREADY_VERIFIED',
            'The exact current frozen revision is already verified in commerce.',
          ),
        ]
      : []),
  ];
}

export function navigationBlockers(context: CompilerContext) {
  return [
    ...requireRole(context, ['buyer']),
    ...(context.authority.commerce
      ? []
      : [
          blocker(
            'COMMERCE_VERIFICATION_MISSING',
            'No exact Admin, publication, and Storefront verification exists for the current revision.',
          ),
        ]),
  ];
}
