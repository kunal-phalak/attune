import { describe, expect, it } from 'vitest';

import { manufacturingAccessForRoles } from './access';

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
});
