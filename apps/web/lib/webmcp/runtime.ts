import type { AgentContextSnapshot, AgentMutationResult } from '@attune/webmcp';

import {
  AttuneHttpError,
  attuneWorkspaceEndpoint,
  commandRequestBody,
  isAttuneApiView,
  type AttuneApiView,
  type CapabilityRole,
} from '../attune-view';

export interface RuntimeStatus {
  readonly execution: 'idle' | 'executing' | 'completed' | 'failed' | 'revalidation_required';
  readonly lastAction: string | null;
}

export interface AgentContextFocus {
  readonly entityIds?: readonly string[];
  readonly nodeIds?: readonly string[];
  readonly constraintIds?: readonly string[];
  readonly groupIds?: readonly string[];
  readonly activeGroupId?: string;
  readonly activeHumanTool?: string;
  readonly region?: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface ToolRuntime {
  readonly current?: (signal?: AbortSignal) => Promise<AttuneApiView>;
  readonly marketplace?: (versionId?: string, signal?: AbortSignal) => Promise<unknown>;
  readonly navigate?: (surface: string, signal?: AbortSignal) => Promise<unknown>;
  readonly observe: (
    focus?: AgentContextFocus,
    signal?: AbortSignal,
  ) => Promise<AgentContextSnapshot>;
  readonly execute: (
    command: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  readonly forecast: (
    command: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
}

async function responseJson(response: Response): Promise<unknown> {
  const payload: unknown = await response.json();
  if (response.ok) return payload;
  const error =
    typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : undefined;
  const code =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : 'REQUEST_FAILED';
  const message =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'message')
      : 'The authoritative request failed.';
  const rawChangedEntities: readonly unknown[] =
    typeof error === 'object' &&
    error !== null &&
    Array.isArray(Reflect.get(error, 'changedEntities'))
      ? Reflect.get(error, 'changedEntities')
      : [];
  const rawLatestVersions =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'latestVersions') : undefined;
  const latestVersions =
    typeof rawLatestVersions === 'object' && rawLatestVersions !== null
      ? Object.fromEntries(
          Object.entries(rawLatestVersions).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === 'number' && Number.isInteger(entry[1]),
          ),
        )
      : {};
  const canRetry =
    typeof error === 'object' && error !== null && Reflect.get(error, 'canRetry') === true;
  throw new AttuneHttpError(
    response.status,
    typeof code === 'string' ? code : 'REQUEST_FAILED',
    typeof message === 'string' ? message : 'The authoritative request failed.',
    canRetry,
    rawChangedEntities.filter((candidate): candidate is string => typeof candidate === 'string'),
    latestVersions,
    canRetry,
  );
}

function isMutationResult(value: unknown): value is AgentMutationResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'status') === 'APPLIED' &&
    Number.isInteger(Reflect.get(value, 'workspaceSequence')) &&
    typeof Reflect.get(value, 'specificationHash') === 'string'
  );
}

function isAgentContextSnapshot(value: unknown): value is AgentContextSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isInteger(Reflect.get(value, 'workspaceSequence')) &&
    typeof Reflect.get(value, 'specificationHash') === 'string' &&
    typeof Reflect.get(value, 'solver') === 'object' &&
    Array.isArray(Reflect.get(value, 'availableActions'))
  );
}

function patchObservation(view: AttuneApiView, mutation: AgentMutationResult): AttuneApiView {
  const available = new Set<string>(mutation.availableCapabilities);
  return {
    ...view,
    specHash: mutation.specificationHash,
    capabilities: view.capabilities.filter(({ id }) => available.has(id)),
    workspace: {
      ...view.workspace,
      workspaceSeq: mutation.workspaceSequence,
      draftVersion: mutation.draftVersion,
      capabilityEpoch: mutation.capabilityEpoch,
      authorityEpoch: mutation.authorityEpoch,
    },
    semantic: { ...view.semantic, documentRevision: mutation.next.revision },
    delegation: mutation.delegation,
  };
}

function semanticErrorResult(error: AttuneHttpError, view: AttuneApiView) {
  return {
    status: error.code,
    error: {
      code: error.code,
      message: error.message,
      semanticRefs: error.changedEntities,
      latestVersions: error.latestVersions,
      whatChanged: error.message,
      canRetry: error.canRetry,
    },
    delegation: view.delegation,
  };
}

function serverTimings(response: Response): Readonly<Record<string, number>> {
  const value = response.headers.get('Server-Timing');
  if (!value) return {};
  return Object.fromEntries(
    value.split(',').flatMap((entry) => {
      const [name, ...parameters] = entry.trim().split(';');
      const duration = parameters
        .map((parameter) => parameter.trim().match(/^dur=([0-9.]+)$/)?.[1])
        .find(Boolean);
      return name && duration ? [[name, Number(duration)] as const] : [];
    }),
  );
}

function withExecutionTimings(
  result: unknown,
  response: Response,
  startedAt: number,
  retryCount: number,
): unknown {
  if (typeof result !== 'object' || result === null) return result;
  return {
    ...result,
    timings: {
      ...serverTimings(response),
      total_tool_execution: Math.max(0, performance.now() - startedAt),
      automatic_retries: retryCount,
    },
  };
}

function currentReferenceVersion(view: AttuneApiView, id: string): number {
  const document = view.workspace.sketchDocument;
  for (const collection of [
    document.entities,
    document.nodes,
    document.groups,
    document.constraints,
    document.dimensions,
    document.parameters,
  ]) {
    const reference = collection.find((candidate) => candidate.id === id);
    if (reference) return reference.version;
  }
  return 0;
}

function rebuildVersionedCommand(
  command: Readonly<Record<string, unknown>>,
  view: AttuneApiView,
): Readonly<Record<string, unknown>> {
  if (command.type === 'set_radius') {
    const target = command.target;
    if (typeof target !== 'object' || target === null) return command;
    const entityId = Reflect.get(target, 'entityId');
    return typeof entityId === 'string'
      ? {
          ...command,
          target: { entityId, expectedVersion: currentReferenceVersion(view, entityId) },
        }
      : command;
  }
  if (command.type === 'set_tangent' && Array.isArray(command.targets)) {
    return {
      ...command,
      targets: command.targets.map((target) => {
        const entityId =
          typeof target === 'object' && target !== null
            ? Reflect.get(target, 'entityId')
            : undefined;
        return typeof entityId === 'string'
          ? { entityId, expectedVersion: currentReferenceVersion(view, entityId) }
          : target;
      }),
    };
  }
  if (command.type === 'update_recipe_parameters' && typeof command.sourceRef === 'string') {
    return {
      ...command,
      expectedVersion: currentReferenceVersion(view, command.sourceRef),
    };
  }
  return command;
}

function contextParameters(focus?: AgentContextFocus): Readonly<Record<string, string | number>> {
  return {
    format: 'context',
    ...(focus?.entityIds?.length ? { entity_ids: focus.entityIds.join(',') } : {}),
    ...(focus?.nodeIds?.length ? { node_ids: focus.nodeIds.join(',') } : {}),
    ...(focus?.constraintIds?.length ? { constraint_ids: focus.constraintIds.join(',') } : {}),
    ...(focus?.groupIds?.length ? { group_ids: focus.groupIds.join(',') } : {}),
    ...(focus?.activeGroupId ? { active_group_id: focus.activeGroupId } : {}),
    ...(focus?.activeHumanTool ? { active_human_tool: focus.activeHumanTool } : {}),
    ...(focus?.region
      ? {
          min_x: focus.region.minX,
          min_y: focus.region.minY,
          max_x: focus.region.maxX,
          max_y: focus.region.maxY,
        }
      : {}),
  };
}

export function compactWorkspaceResult(view: AttuneApiView) {
  return {
    workspaceSequence: view.workspace.workspaceSeq,
    draftVersion: view.workspace.draftVersion,
    specificationHash: view.specHash,
    validation: {
      valid: view.validation.valid,
      conflicts: view.validation.issues.map(({ id, source, message }) => ({ id, source, message })),
    },
    unseenChanges: view.observation.interventions.map(
      ({ receiptSeq, command, affectedEntities }) => ({
        sequence: receiptSeq,
        command,
        semanticRefs: affectedEntities,
      }),
    ),
    availableCapabilities: view.capabilities.map(({ id }) => id),
    latestReceipt: view.latestReceipt
      ? {
          id: view.latestReceipt.receiptId,
          command: view.latestReceipt.command,
          sequence: view.latestReceipt.workspaceSeq,
          changedEntities: view.latestReceipt.consequence.changedEntities,
        }
      : null,
  };
}

export function createToolRuntime(input: {
  readonly workspaceId: string;
  readonly perspective:
    | Extract<CapabilityRole, 'buyer' | 'provider'>
    | (() => Extract<CapabilityRole, 'buyer' | 'provider'>);
  readonly viewRef: { current: AttuneApiView | null };
  readonly updateView: (view: AttuneApiView) => void;
  readonly report: (status: RuntimeStatus) => void;
}): ToolRuntime {
  const perspective = () =>
    typeof input.perspective === 'function' ? input.perspective() : input.perspective;
  const workspaceEndpoint = (parameters?: Readonly<Record<string, string | number>>) =>
    attuneWorkspaceEndpoint('/api/attune/webmcp', input.workspaceId, {
      perspective: perspective(),
      ...parameters,
    });
  const observe = async (focus?: AgentContextFocus, signal?: AbortSignal) => {
    const startedAt = performance.now();
    input.report({ execution: 'executing', lastAction: 'inspect_context' });
    try {
      const response = await fetch(workspaceEndpoint(contextParameters(focus)), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      });
      const context = await responseJson(response);
      if (!isAgentContextSnapshot(context)) {
        throw new TypeError('Attune returned an invalid agent context snapshot.');
      }
      input.report({ execution: 'completed', lastAction: 'inspect_context' });
      return {
        ...context,
        timings: {
          ...serverTimings(response),
          total_tool_execution: Math.max(0, performance.now() - startedAt),
        },
      };
    } catch (error) {
      input.report({ execution: 'failed', lastAction: 'inspect_context' });
      throw error;
    }
  };
  const current = async (signal?: AbortSignal) => {
    input.report({ execution: 'executing', lastAction: 'inspect_quote_or_order' });
    try {
      const response = await fetch(workspaceEndpoint(), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      });
      const next = await responseJson(response);
      if (!isAttuneApiView(next)) throw new TypeError('Attune returned an invalid workspace view.');
      input.viewRef.current = next;
      input.updateView(next);
      input.report({ execution: 'completed', lastAction: 'inspect_quote_or_order' });
      return next;
    } catch (error) {
      input.report({ execution: 'failed', lastAction: 'inspect_quote_or_order' });
      throw error;
    }
  };
  const marketplace = async (versionId?: string, signal?: AbortSignal) => {
    input.report({ execution: 'executing', lastAction: 'find_makers' });
    try {
      const response = await fetch(
        attuneWorkspaceEndpoint(
          '/api/attune/marketplace',
          input.workspaceId,
          versionId ? { version_id: versionId } : undefined,
        ),
        { cache: 'no-store', headers: { Accept: 'application/json' }, signal },
      );
      const payload = await responseJson(response);
      const nextView =
        typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'view') : undefined;
      if (isAttuneApiView(nextView)) {
        input.viewRef.current = nextView;
        input.updateView(nextView);
      }
      input.report({ execution: 'completed', lastAction: 'find_makers' });
      return payload;
    } catch (error) {
      input.report({ execution: 'failed', lastAction: 'find_makers' });
      throw error;
    }
  };
  const navigate: ToolRuntime['navigate'] = async (surface, signal) => {
    const currentSurface = new URLSearchParams(window.location.search).get('surface') ?? 'design';
    const fromSurface =
      currentSurface === 'marketplace'
        ? 'find_makers'
        : currentSurface === 'provider_requests'
          ? 'maker_requests'
          : currentSurface === 'provider_profile'
            ? 'maker_profile'
            : currentSurface;
    const currentPerspective = perspective();
    const requiredPerspective =
      surface === 'buyer_orders'
        ? 'buyer'
        : surface === 'maker_requests' || surface === 'maker_profile'
          ? 'provider'
          : currentPerspective;
    const action = 'navigate_workspace';
    input.report({ execution: 'executing', lastAction: action });
    try {
      const response = await fetch(
        attuneWorkspaceEndpoint('/api/attune/webmcp', input.workspaceId, {
          perspective: requiredPerspective,
        }),
        { cache: 'no-store', headers: { Accept: 'application/json' }, signal },
      );
      const authorizedView = await responseJson(response);
      if (!isAttuneApiView(authorizedView)) {
        throw new TypeError('Attune returned an invalid navigation authority response.');
      }
      signal?.throwIfAborted();
      const pageSurface =
        surface === 'find_makers'
          ? 'marketplace'
          : surface === 'maker_requests'
            ? 'provider_requests'
            : surface === 'maker_profile'
              ? 'provider_profile'
              : surface;
      if (surface === 'settings') {
        window.location.assign('/settings?section=integrations');
        input.report({ execution: 'completed', lastAction: action });
        return {
          status: 'NAVIGATION_INITIATED',
          fromSurface,
          toSurface: surface,
          perspective: requiredPerspective,
          authorityUnchanged: true,
        };
      }
      const parameters = new URLSearchParams();
      if (requiredPerspective === 'provider') parameters.set('perspective', 'provider');
      if (pageSurface !== 'design') parameters.set('surface', pageSurface);
      const url = `/workspace/${encodeURIComponent(input.workspaceId)}${parameters.size ? `?${parameters}` : ''}`;
      window.location.assign(url);
      input.report({ execution: 'completed', lastAction: action });
      return {
        status: 'NAVIGATION_INITIATED',
        fromSurface,
        toSurface: surface,
        perspective: requiredPerspective,
        authorityUnchanged: true,
      };
    } catch (error) {
      input.report({ execution: 'failed', lastAction: action });
      throw error;
    }
  };
  const execute = async (command: Readonly<Record<string, unknown>>, signal?: AbortSignal) => {
    const startedAt = performance.now();
    const action = typeof command.type === 'string' ? command.type : 'attune_command';
    const observed = input.viewRef.current;
    if (!observed) throw new Error('The authoritative WebMCP bootstrap is not loaded.');
    input.report({ execution: 'executing', lastAction: action });
    try {
      const executeAttempt = async (
        view: AttuneApiView,
        nextCommand: Readonly<Record<string, unknown>>,
      ) => {
        const response = await fetch(workspaceEndpoint(), {
          method: 'POST',
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: commandRequestBody(view, nextCommand, 'webmcp', view.workspace.workspaceSeq),
          signal,
        });
        return { response, result: await responseJson(response) };
      };
      let retryCount = 0;
      let attempt;
      try {
        attempt = await executeAttempt(observed, command);
      } catch (error) {
        if (
          !(error instanceof AttuneHttpError) ||
          error.code !== 'CONTEXT_CHANGED' ||
          !error.canRetry
        ) {
          throw error;
        }
        retryCount = 1;
        const refreshResponse = await fetch(workspaceEndpoint(), {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal,
        });
        const refreshed = await responseJson(refreshResponse);
        if (!isAttuneApiView(refreshed)) {
          throw new TypeError('Attune returned an invalid retry context.', { cause: error });
        }
        input.viewRef.current = refreshed;
        input.updateView(refreshed);
        attempt = await executeAttempt(refreshed, rebuildVersionedCommand(command, refreshed));
      }
      const { response, result } = attempt;
      if (isMutationResult(result)) {
        const patched = patchObservation(input.viewRef.current ?? observed, result);
        input.viewRef.current = patched;
        input.updateView(patched);
      } else if (isAttuneApiView(result)) {
        input.viewRef.current = result;
        input.updateView(result);
      }
      input.report({ execution: 'completed', lastAction: action });
      return withExecutionTimings(
        isAttuneApiView(result) ? { status: 'APPLIED', ...compactWorkspaceResult(result) } : result,
        response,
        startedAt,
        retryCount,
      );
    } catch (error) {
      input.report({ execution: 'failed', lastAction: action });
      if (error instanceof AttuneHttpError) return semanticErrorResult(error, observed);
      throw error;
    }
  };
  const forecast = async (command: Readonly<Record<string, unknown>>, signal?: AbortSignal) => {
    const startedAt = performance.now();
    input.report({ execution: 'executing', lastAction: 'forecast_change' });
    try {
      const response = await fetch(
        attuneWorkspaceEndpoint('/api/attune/webmcp/forecast', input.workspaceId, {
          perspective: perspective(),
        }),
        {
          method: 'POST',
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
          signal,
        },
      );
      const result = await responseJson(response);
      input.report({ execution: 'completed', lastAction: 'forecast_change' });
      return withExecutionTimings(result, response, startedAt, 0);
    } catch (error) {
      input.report({ execution: 'failed', lastAction: 'forecast_change' });
      const observed = input.viewRef.current;
      if (error instanceof AttuneHttpError && observed) {
        return semanticErrorResult(error, observed);
      }
      throw error;
    }
  };
  return { current, execute, forecast, marketplace, navigate, observe };
}
