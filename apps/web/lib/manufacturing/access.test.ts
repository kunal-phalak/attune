import { describe, expect, it } from 'vitest';

import { assertMarketplaceRouteAccess, manufacturingAccessForRoles } from './access';

describe('manufacturing marketplace access', () => {
  it.each([
    ['owner', ['buyer', 'editor', 'reviewer'], true, false],
    ['editor', ['editor', 'reviewer'], false, false],
    ['viewer', ['reviewer'], false, false],
    ['commenter', ['reviewer'], false, false],
    ['maker', ['provider', 'reviewer'], false, true],
    ['judge', ['buyer', 'provider', 'editor', 'reviewer'], true, true],
  ] as const)(
    'allows %s to browse without granting business authority',
    (_label, roles, buyer, maker) => {
      const access = manufacturingAccessForRoles(roles);
      expect(access.browseMarketplace).toBe(true);
      expect(access.configureRequest).toBe(buyer);
      expect(access.inspectMakerRequests).toBe(maker);
      expect(access.finalizeQuote).toBe(maker);
    },
  );

  it.each([
    ['owner', ['buyer', 'editor', 'reviewer']],
    ['editor', ['editor', 'reviewer']],
    ['viewer', ['reviewer']],
    ['commenter', ['reviewer']],
    ['maker', ['provider', 'reviewer']],
    ['judge', ['buyer', 'provider', 'editor', 'reviewer']],
  ] as const)('allows %s through the marketplace GET route', (_label, roles) => {
    expect(() => assertMarketplaceRouteAccess(roles, 'GET')).not.toThrow();
  });

  it('allows buyers to select a marketplace Maker without granting profile management', () => {
    expect(() =>
      assertMarketplaceRouteAccess(['buyer', 'editor', 'reviewer'], 'SELECT_MAKER'),
    ).not.toThrow();
    expect(() => assertMarketplaceRouteAccess(['provider', 'reviewer'], 'SELECT_MAKER')).toThrow(
      'WORKSPACE_ROLE_REQUIRED',
    );
  });

  it('limits Maker-profile management to Maker authority', () => {
    expect(() =>
      assertMarketplaceRouteAccess(['provider', 'reviewer'], 'MANAGE_PROFILE'),
    ).not.toThrow();
    for (const roles of [
      ['buyer', 'editor', 'reviewer'],
      ['editor', 'reviewer'],
      ['reviewer'],
    ] as const) {
      expect(() => assertMarketplaceRouteAccess(roles, 'MANAGE_PROFILE')).toThrow(
        'WORKSPACE_ROLE_REQUIRED',
      );
    }
  });
});
