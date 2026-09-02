import type { AgentContextSnapshot, AgentMutationResult } from '@attune/webmcp';

import {
  AttuneHttpError,
  attuneWorkspaceEndpoint,
  commandRequestBody,
  isAttuneApiView,
  requestAttuneView,
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
  readonly observe: (
    focus?: AgentContextFocus,
    signal?: AbortSignal,
  ) => Promise<AgentContextSnapshot>;
  readonly observeWorkspace: (signal?: AbortSignal) => Promise<AttuneApiView>;
  readonly execute: (
    command: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  readonly forecast: (
    command: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  readonly navigateToStorefront: (signal?: AbortSignal) => Promise<unknown>;
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
  throw new AttuneHttpError(
    response.status,
    typeof code === 'string' ? code : 'REQUEST_FAILED',
    typeof message === 'string' ? message : 'The authoritative request failed.',
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
  };
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
    repairs: view.repairs,
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
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly viewRef: { current: AttuneApiView | null };
  readonly updateView: (view: AttuneApiView) => void;
  readonly report: (status: RuntimeStatus) => void;
}): ToolRuntime {
  const workspaceEndpoint = (parameters?: Readonly<Record<string, string | number>>) =>
    attuneWorkspaceEndpoint('/api/attune/webmcp', input.workspaceId, {
      perspective: input.perspective,
      ...parameters,
    });
  const observeWorkspace = async (signal?: AbortSignal) => {
    const view = await requestAttuneView(workspaceEndpoint(), { signal });
    input.viewRef.current = view;
    input.updateView(view);
    return view;
  };
  const observe = async (focus?: AgentContextFocus, signal?: AbortSignal) => {
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
      return context;
    } catch (error) {
      input.report({ execution: 'failed', lastAction: 'inspect_context' });
      throw error;
    }
  };
  const execute = async (command: Readonly<Record<string, unknown>>, signal?: AbortSignal) => {
    const action = typeof command.type === 'string' ? command.type : 'attune_command';
    const observed = input.viewRef.current;
    if (!observed) throw new Error('The authoritative WebMCP bootstrap is not loaded.');
    input.report({ execution: 'executing', lastAction: action });
    try {
      const response = await fetch(workspaceEndpoint(), {
        method: 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: commandRequestBody(observed, command, 'webmcp', observed.workspace.workspaceSeq),
        signal,
      });
      const result = await responseJson(response);
      if (isMutationResult(result)) {
        const patched = patchObservation(observed, result);
        input.viewRef.current = patched;
        input.updateView(patched);
      } else if (isAttuneApiView(result)) {
        input.viewRef.current = result;
        input.updateView(result);
      }
      input.report({ execution: 'completed', lastAction: action });
      return isAttuneApiView(result)
        ? { status: 'APPLIED', ...compactWorkspaceResult(result) }
        : result;
    } catch (error) {
      input.report({ execution: 'failed', lastAction: action });
      throw error;
    }
  };
  const forecast = async (command: Readonly<Record<string, unknown>>, signal?: AbortSignal) => {
    input.report({ execution: 'executing', lastAction: 'forecast_change' });
    try {
      const response = await fetch(
        attuneWorkspaceEndpoint('/api/attune/webmcp/forecast', input.workspaceId, {
          perspective: input.perspective,
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
      return result;
    } catch (error) {
      input.report({ execution: 'failed', lastAction: 'forecast_change' });
      throw error;
    }
  };
  const navigateToStorefront = async (signal?: AbortSignal) => {
    const view = await observeWorkspace(signal);
    const commerce = view.workspace.commerceLinks.find(
      ({ revisionId, specHash }) =>
        revisionId === `r${view.workspace.draftVersion}` && specHash === view.specHash,
    );
    if (!commerce) {
      input.report({
        execution: 'revalidation_required',
        lastAction: 'open_verified_shopify_product',
      });
      return { status: 'REVALIDATION_REQUIRED', ...compactWorkspaceResult(view) };
    }
    window.location.assign(commerce.verification.storefrontUrl);
    return {
      status: 'NAVIGATING_TOP_LEVEL',
      destination: commerce.verification.storefrontUrl,
      revisionId: commerce.revisionId,
      specificationHash: commerce.specHash,
    };
  };
  return { execute, forecast, navigateToStorefront, observe, observeWorkspace };
}
