import { createJudgeProviderCapabilityProfile } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { isMarketplaceInstallationListed } from './marketplace';

function profile(marketplaceListed: boolean) {
  return { ...createJudgeProviderCapabilityProfile(), marketplaceListed };
}

describe('cross-account Maker marketplace visibility', () => {
  it('keeps OAuth-era Maker profiles visible when the legacy row flag was false', () => {
    expect(
      isMarketplaceInstallationListed({
        marketplaceListed: false,
        makerProfile: profile(true),
      }),
    ).toBe(true);
  });

  it('respects an explicit Maker opt-out', () => {
    expect(
      isMarketplaceInstallationListed({
        marketplaceListed: false,
        makerProfile: profile(false),
      }),
    ).toBe(false);
  });

  it('does not publish a connected store before a Maker profile exists', () => {
    expect(isMarketplaceInstallationListed({ marketplaceListed: false, makerProfile: null })).toBe(
      false,
    );
  });
});
