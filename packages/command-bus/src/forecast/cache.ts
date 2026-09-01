import {
  hashCanonical,
  sketchSpecification,
  type AttuneCommand,
  type AttuneRole,
  type AttuneWorkspace,
} from '@attune/domain';

import type { WorkspaceForecast } from './consequence';

const MAX_FORECASTS = 128;
const forecasts = new Map<string, WorkspaceForecast>();

export function semanticForecastKey(input: {
  readonly workspace: AttuneWorkspace;
  readonly command: AttuneCommand;
  readonly role: AttuneRole;
}): string {
  return hashCanonical({
    documentHash: hashCanonical(sketchSpecification(input.workspace.sketchDocument)),
    commandFingerprint: hashCanonical(input.command),
    workspaceHash: hashCanonical(input.workspace),
    role: input.role,
  });
}

export function cachedForecast(key: string): WorkspaceForecast | undefined {
  const cached = forecasts.get(key);
  return cached ? structuredClone(cached) : undefined;
}

export function cacheForecast(key: string, forecast: WorkspaceForecast): WorkspaceForecast {
  if (forecasts.size >= MAX_FORECASTS) forecasts.delete(forecasts.keys().next().value ?? '');
  forecasts.set(key, structuredClone(forecast));
  return forecast;
}
