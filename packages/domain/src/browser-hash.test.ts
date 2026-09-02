import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { browserHashCanonical } from './browser-hash';

function nodeHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('browserHashCanonical', () => {
  it('matches Node SHA-256 for canonical JSON across block boundaries', () => {
    const canonical = {
      alpha: Array.from({ length: 40 }, (_, index) => ({ index, value: `point-${index}` })),
      beta: true,
    };
    expect(browserHashCanonical({ beta: true, alpha: canonical.alpha })).toBe(nodeHash(canonical));
  });
});
