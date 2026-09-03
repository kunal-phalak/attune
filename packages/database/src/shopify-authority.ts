import type { AttuneRole } from '@attune/domain';

export function rolesAfterShopifyConnection(roles: readonly AttuneRole[]): {
  readonly roles: readonly AttuneRole[];
  readonly changed: boolean;
} {
  if (roles.includes('provider')) return { roles: [...roles], changed: false };
  return { roles: [...roles, 'provider'], changed: true };
}
