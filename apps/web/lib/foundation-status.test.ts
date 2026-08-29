import { describe, expect, it } from 'vitest';

import { getFoundationBuildStatus, SHOPIFY_CONNECTION_KEYS } from './foundation-status';

describe('getFoundationBuildStatus', () => {
  it('reports every missing Shopify input without exposing values', () => {
    const status = getFoundationBuildStatus({ NODE_ENV: 'test' });

    expect(status.shopify.connected).toBe(false);
    expect(status.shopify.missingInputs).toEqual(SHOPIFY_CONNECTION_KEYS);
    expect(status.webmcp.scope).toBe('phase-a-only');
    expect(JSON.stringify(status)).not.toContain('secret');
  });

  it('unlocks only the connectivity spike when every input is present', () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      ...Object.fromEntries(SHOPIFY_CONNECTION_KEYS.map((key) => [key, `configured-${key}`])),
    };
    const status = getFoundationBuildStatus(environment);

    expect(status.shopify).toMatchObject({
      connected: true,
      configuredInputs: SHOPIFY_CONNECTION_KEYS.length,
      missingInputs: [],
      nextGate: 'run-connectivity-spike',
    });
  });
});
