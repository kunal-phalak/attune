import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { judgeAccessCodeMatches } from './judge-access';

afterEach(() => vi.unstubAllEnvs());

describe('judge access-code verification', () => {
  it('matches the SHA-256 digest without storing the raw code', () => {
    const code = 'attune-release-test-code';
    vi.stubEnv('ATTUNE_JUDGE_TOKEN_HASH', createHash('sha256').update(code).digest('hex'));

    expect(judgeAccessCodeMatches(code)).toBe(true);
    expect(judgeAccessCodeMatches(`${code}-wrong`)).toBe(false);
  });

  it('fails closed when the configured digest is absent or malformed', () => {
    vi.stubEnv('ATTUNE_JUDGE_TOKEN_HASH', 'not-a-sha256-digest');
    expect(judgeAccessCodeMatches('anything')).toBe(false);

    vi.stubEnv('ATTUNE_JUDGE_TOKEN_HASH', '');
    expect(judgeAccessCodeMatches('anything')).toBe(false);
  });
});
