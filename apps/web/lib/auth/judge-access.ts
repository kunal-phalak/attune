import { createHash, timingSafeEqual } from 'node:crypto';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export function judgeAccessCodeConfigured(): boolean {
  return SHA256_HEX.test(process.env.ATTUNE_JUDGE_TOKEN_HASH ?? '');
}

export function judgeAccessCodeMatches(accessCode: string): boolean {
  const configuredHash = process.env.ATTUNE_JUDGE_TOKEN_HASH ?? '';
  const configured = judgeAccessCodeConfigured();
  const expected = configured ? Buffer.from(configuredHash, 'hex') : Buffer.alloc(32);
  const supplied = createHash('sha256').update(accessCode).digest();
  return timingSafeEqual(expected, supplied) && configured;
}
