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
  method: 'GET' | 'POST',
): ManufacturingAccess {
  const access = manufacturingAccessForRoles(roles);
  if (method === 'GET' ? !access.browseMarketplace : !access.finalizeQuote) {
    throw new Error('WORKSPACE_ROLE_REQUIRED');
  }
  return access;
}
