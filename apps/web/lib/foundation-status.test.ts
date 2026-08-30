import { describe, expect, it } from 'vitest';

import { getFoundationBuildStatus, SHOPIFY_SERVER_KEYS } from './foundation-status';

describe('getFoundationBuildStatus', () => {
  it('reports every missing Shopify input without exposing values', () => {
    const status = getFoundationBuildStatus({ NODE_ENV: 'test' });

    expect(status.shopify.serverConfigured).toBe(false);
    expect(status.shopify.missingServerInputs).toEqual(SHOPIFY_SERVER_KEYS);
    expect(status.webmcp.retiredPhaseATool).toEqual({
      name: 'inspect_attune_build',
      active: false,
      scope: 'phase-a-only',
    });
    expect(JSON.stringify(status)).not.toContain('secret');
  });

  it('reports the live Shopify handoff gate when every server input is present', () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      ...Object.fromEntries(SHOPIFY_SERVER_KEYS.map((key) => [key, `configured-${key}`])),
    };
    const status = getFoundationBuildStatus(environment);

    expect(status.shopify).toMatchObject({
      serverConfigured: true,
      configuredServerInputs: SHOPIFY_SERVER_KEYS.length,
      missingServerInputs: [],
      storefrontPasswordPolicy: 'judge-supplied-on-liquid-storefront',
      nextGate: 'grant-read_inventory-and-complete-handoff',
    });
  });
});
