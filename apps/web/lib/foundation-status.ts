export const SHOPIFY_SERVER_KEYS = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ONLINE_STORE_PUBLICATION_ID',
  'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  'SHOPIFY_ADMIN_API_VERSION',
  'SHOPIFY_STOREFRONT_API_VERSION',
] as const;

export interface FoundationBuildStatus {
  application: 'attune';
  phase: 'p0-manufacturing-outcome';
  deployment: {
    environment: string;
    revision: string | null;
  };
  webmcp: {
    runtime: 'document.modelContext';
    mode: 'imperative';
    surface: 'contextual-attune-tools';
    retiredPhaseATool: {
      name: 'inspect_attune_build';
      active: false;
      scope: 'phase-a-only';
    };
  };
  shopify: {
    serverConfigured: boolean;
    configuredServerInputs: number;
    requiredServerInputs: number;
    missingServerInputs: string[];
    storefrontPasswordPolicy: 'judge-supplied-on-liquid-storefront';
    nextGate: 'configure-server-integration' | 'grant-read_inventory-and-complete-handoff';
  };
}

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getFoundationBuildStatus(environment: NodeJS.ProcessEnv): FoundationBuildStatus {
  const missingServerInputs = SHOPIFY_SERVER_KEYS.filter((key) => !hasValue(environment[key]));
  const configuredServerInputs = SHOPIFY_SERVER_KEYS.length - missingServerInputs.length;

  return {
    application: 'attune',
    phase: 'p0-manufacturing-outcome',
    deployment: {
      environment: environment.VERCEL_ENV ?? environment.NODE_ENV ?? 'local',
      revision: environment.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    },
    webmcp: {
      runtime: 'document.modelContext',
      mode: 'imperative',
      surface: 'contextual-attune-tools',
      retiredPhaseATool: {
        name: 'inspect_attune_build',
        active: false,
        scope: 'phase-a-only',
      },
    },
    shopify: {
      serverConfigured: missingServerInputs.length === 0,
      configuredServerInputs,
      requiredServerInputs: SHOPIFY_SERVER_KEYS.length,
      missingServerInputs,
      storefrontPasswordPolicy: 'judge-supplied-on-liquid-storefront',
      nextGate:
        missingServerInputs.length === 0
          ? 'grant-read_inventory-and-complete-handoff'
          : 'configure-server-integration',
    },
  };
}
