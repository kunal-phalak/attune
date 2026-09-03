import { createJudgeProviderCapabilityProfile } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { isMarketplaceInstallationListed, marketplaceInstallationsForViewer } from './marketplace';

function profile(marketplaceListed: boolean) {
  return { ...createJudgeProviderCapabilityProfile(), marketplaceListed };
}

describe('cross-account Maker marketplace visibility', () => {
  it('keeps OAuth-era Maker profiles visible when the legacy row flag was false', () => {
    expect(
      isMarketplaceInstallationListed({
        connectionStatus: 'connected',
        marketplaceListed: false,
        makerProfile: profile(true),
      }),
    ).toBe(true);
  });

  it('respects an explicit Maker opt-out', () => {
    expect(
      isMarketplaceInstallationListed({
        connectionStatus: 'connected',
        marketplaceListed: false,
        makerProfile: profile(false),
      }),
    ).toBe(false);
  });

  it('publishes a connected legacy store while its Maker profile is repaired', () => {
    expect(
      isMarketplaceInstallationListed({
        connectionStatus: 'connected',
        marketplaceListed: false,
        makerProfile: null,
      }),
    ).toBe(true);
  });

  it('never publishes an inactive Shopify installation', () => {
    expect(
      isMarketplaceInstallationListed({
        connectionStatus: 'disconnected',
        marketplaceListed: true,
        makerProfile: profile(true),
      }),
    ).toBe(false);
  });

  it('shows both stores to the Judge and only the other store to each Maker account', () => {
    const stores = [
      {
        id: 'shopify:first',
        ownerPrincipalId: 'principal:first',
        connectionStatus: 'connected' as const,
        marketplaceListed: true,
        makerProfile: profile(true),
      },
      {
        id: 'shopify:second',
        ownerPrincipalId: 'principal:second',
        connectionStatus: 'connected' as const,
        marketplaceListed: true,
        makerProfile: profile(true),
      },
    ];

    expect(marketplaceInstallationsForViewer(stores, 'principal:judge', true)).toHaveLength(2);
    expect(
      marketplaceInstallationsForViewer(stores, 'principal:first', false).map(({ id }) => id),
    ).toEqual(['shopify:second']);
    expect(
      marketplaceInstallationsForViewer(stores, 'principal:second', false).map(({ id }) => id),
    ).toEqual(['shopify:first']);
  });
});
