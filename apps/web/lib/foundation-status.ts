export const SHOPIFY_CONNECTION_KEYS = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_STOREFRONT_PASSWORD',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ONLINE_STORE_PUBLICATION_ID',
  'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  'SHOPIFY_ADMIN_API_VERSION',
  'SHOPIFY_STOREFRONT_API_VERSION',
] as const;

export interface FoundationBuildStatus {
  application: 'attune';
  phase: 'external-risk-first-foundation';
  deployment: {
    environment: string;
    revision: string | null;
  };
  webmcp: {
    tool: 'inspect_attune_build';
    mode: 'imperative';
    readOnly: true;
    scope: 'phase-a-only';
  };
  shopify: {
    connected: boolean;
    configuredInputs: number;
    requiredInputs: number;
    missingInputs: string[];
    nextGate: 'connect-shopify' | 'run-connectivity-spike';
  };
}

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getFoundationBuildStatus(environment: NodeJS.ProcessEnv): FoundationBuildStatus {
  const missingInputs = SHOPIFY_CONNECTION_KEYS.filter((key) => !hasValue(environment[key]));
  const configuredInputs = SHOPIFY_CONNECTION_KEYS.length - missingInputs.length;

  return {
    application: 'attune',
    phase: 'external-risk-first-foundation',
    deployment: {
      environment: environment.VERCEL_ENV ?? environment.NODE_ENV ?? 'local',
      revision: environment.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    },
    webmcp: {
      tool: 'inspect_attune_build',
      mode: 'imperative',
      readOnly: true,
      scope: 'phase-a-only',
    },
    shopify: {
      connected: missingInputs.length === 0,
      configuredInputs,
      requiredInputs: SHOPIFY_CONNECTION_KEYS.length,
      missingInputs,
      nextGate: missingInputs.length === 0 ? 'run-connectivity-spike' : 'connect-shopify',
    },
  };
}
