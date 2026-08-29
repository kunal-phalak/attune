'use client';

import { useEffect, useState } from 'react';

import type { FoundationBuildStatus } from '../lib/foundation-status';

type RegistrationState = 'checking' | 'registered' | 'unsupported' | 'failed';

function validateEmptyInput(input: unknown): void {
  if (input === undefined || input === null) {
    return;
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('inspect_attune_build accepts an empty object.');
  }

  if (Object.keys(input).length > 0) {
    throw new TypeError('inspect_attune_build does not accept arguments.');
  }
}

function afterVisibleUpdate(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function loadBuildStatus(): Promise<FoundationBuildStatus> {
  const response = await fetch('/api/build-status', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Build status request failed with ${response.status}.`);
  }

  const payload: unknown = await response.json();

  if (!isFoundationBuildStatus(payload)) {
    throw new TypeError('Build status response did not match the Attune contract.');
  }

  return payload;
}

function isFoundationBuildStatus(value: unknown): value is FoundationBuildStatus {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    Reflect.get(value, 'application') === 'attune' &&
    Reflect.get(value, 'phase') === 'external-risk-first-foundation' &&
    typeof Reflect.get(value, 'shopify') === 'object' &&
    Reflect.get(value, 'shopify') !== null
  );
}

export function AttuneWebMcp() {
  const [registrationState, setRegistrationState] = useState<RegistrationState>('checking');
  const [lastInspection, setLastInspection] = useState<string | null>(null);

  useEffect(() => {
    const context = document.modelContext;

    if (!context?.registerTool) {
      setRegistrationState('unsupported');
      return undefined;
    }

    const lifecycle = new AbortController();

    try {
      const registration = context.registerTool(
        {
          name: 'inspect_attune_build',
          title: 'Inspect Attune Phase-A build',
          description:
            'Temporary Phase-A-only diagnostic. Read the current Attune foundation phase and whether Shopify connectivity inputs are configured. This tool never returns secret values and is removed when Attune advances beyond Phase A.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false,
          },
          async execute(input) {
            validateEmptyInput(input);
            const status = await loadBuildStatus();
            setLastInspection(new Date().toISOString());
            await afterVisibleUpdate();
            return status;
          },
        },
        { signal: lifecycle.signal },
      );

      void Promise.resolve(registration)
        .then(() => setRegistrationState('registered'))
        .catch(() => setRegistrationState('failed'));
    } catch {
      setRegistrationState('failed');
    }

    return () => lifecycle.abort();
  }, []);

  return (
    <aside className="webmcp-state" aria-live="polite">
      <span>Phase-A WebMCP</span>
      <strong>{registrationState}</strong>
      {lastInspection ? <time dateTime={lastInspection}>inspected now</time> : null}
    </aside>
  );
}
