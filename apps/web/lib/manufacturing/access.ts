import type { AttuneRole } from '@attune/domain';

export interface ManufacturingAccess {
  readonly browseMarketplace: boolean;
  readonly configureRequest: boolean;
  readonly inspectMakerRequests: boolean;
  readonly finalizeQuote: boolean;
}

export function manufacturingAccessForRoles(roles: readonly AttuneRole[]): ManufacturingAccess {
  const roleSet = new Set(roles);
  return {
    browseMarketplace:
      roleSet.has('reviewer') ||
      roleSet.has('editor') ||
      roleSet.has('buyer') ||
      roleSet.has('provider'),
    configureRequest: roleSet.has('buyer'),
    inspectMakerRequests: roleSet.has('provider'),
    finalizeQuote: roleSet.has('provider'),
  };
}

export function assertMarketplaceRouteAccess(
  roles: readonly AttuneRole[],
  operation: 'GET' | 'SELECT_MAKER' | 'MANAGE_PROFILE',
): ManufacturingAccess {
  const access = manufacturingAccessForRoles(roles);
  const allowed =
    operation === 'GET'
      ? access.browseMarketplace
      : operation === 'SELECT_MAKER'
        ? access.configureRequest
        : access.finalizeQuote;
  if (!allowed) {
    throw new Error('WORKSPACE_ROLE_REQUIRED');
  }
  return access;
}
