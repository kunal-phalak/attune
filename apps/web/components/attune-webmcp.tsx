'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type RegistrationState = 'checking' | 'registered' | 'unsupported' | 'failed';
type RepairId = 'move_slot_left_to_clearance' | 'narrow_slot_to_clearance';

interface AttuneApiView {
  readonly workspace: {
    readonly commitmentId: string;
    readonly workspaceSeq: number;
    readonly draftVersion: number;
    readonly capabilityEpoch: number;
  };
  readonly validation: {
    readonly valid: boolean;
    readonly evidence: {
      readonly slotRightClearanceMm: number;
      readonly requiredSlotClearanceMm: number;
      readonly lockedMountsPreserved: number;
      readonly lockedMountsTotal: number;
    };
  };
  readonly capabilities: readonly { readonly id: string }[];
  readonly repairs: readonly { readonly id: string; readonly label: string }[];
  readonly observation: {
    readonly interventions: readonly unknown[];
  };
  readonly receipt?: {
    readonly receiptId: string;
    readonly afterHash: string;
    readonly preservedLocks: readonly string[];
  };
}

interface ToolRuntime {
  readonly observe: () => Promise<AttuneApiView>;
  readonly applyRepair: (repairId: RepairId) => Promise<unknown>;
}

function isAttuneApiView(value: unknown): value is AttuneApiView {
  if (typeof value !== 'object' || value === null) return false;
  const workspace = Reflect.get(value, 'workspace');
  return (
    typeof workspace === 'object' &&
    workspace !== null &&
    Reflect.get(workspace, 'commitmentId') === 'AT-1042' &&
    Number.isInteger(Reflect.get(workspace, 'workspaceSeq'))
  );
}

function jsonHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  return headers;
}

async function requestView(path: string, init?: RequestInit): Promise<AttuneApiView> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: jsonHeaders(init?.headers),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error =
      typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : payload;
    throw new Error(`Attune command rejected (${response.status}): ${JSON.stringify(error)}`);
  }
  if (!isAttuneApiView(payload)) throw new TypeError('Attune returned an invalid workspace view.');
  return payload;
}

function validateEmptyInput(input: unknown): void {
  if (input === undefined || input === null) return;
  if (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 0) {
    throw new TypeError('This tool accepts an empty object.');
  }
}

function readRepairId(input: unknown): RepairId {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('repair_id is required.');
  }
  const value = Reflect.get(input, 'repair_id');
  if (value !== 'move_slot_left_to_clearance' && value !== 'narrow_slot_to_clearance') {
    throw new TypeError('repair_id must identify one of the offered deterministic repairs.');
  }
  return value;
}

function summarize(view: AttuneApiView) {
  return {
    commitment_id: view.workspace.commitmentId,
    workspace_seq: view.workspace.workspaceSeq,
    draft_version: view.workspace.draftVersion,
    capability_epoch: view.workspace.capabilityEpoch,
    valid: view.validation.valid,
    clearance_mm: view.validation.evidence.slotRightClearanceMm,
    required_clearance_mm: view.validation.evidence.requiredSlotClearanceMm,
    locked_mounts_preserved: `${view.validation.evidence.lockedMountsPreserved}/${view.validation.evidence.lockedMountsTotal}`,
    capabilities: view.capabilities.map(({ id }) => id),
    human_interventions_since_last_observation: view.observation.interventions,
    deterministic_repairs: view.repairs,
    receipt: view.receipt,
  };
}

function createToolRuntime(
  cursor: { current: number },
  updateView: (view: AttuneApiView) => void,
): ToolRuntime {
  const observe = async () => {
    const next = await requestView(`/api/attune/webmcp?cursor=${cursor.current}`);
    cursor.current = next.workspace.workspaceSeq;
    updateView(next);
    return next;
  };
  const applyRepair = async (repairId: RepairId) => {
    const observed = await observe();
    if (observed.observation.interventions.length > 0) {
      return {
        status: 'REVALIDATION_REQUIRED',
        reason: 'Human intervention was detected before execution.',
        ...summarize(observed),
      };
    }
    const next = await requestView('/api/attune/webmcp', {
      method: 'POST',
      body: JSON.stringify({
        repairId,
        commandId: `webmcp-${crypto.randomUUID()}`,
        expectedWorkspaceSeq: observed.workspace.workspaceSeq,
        expectedCapabilityEpoch: observed.workspace.capabilityEpoch,
        observationCursor: cursor.current,
      }),
    });
    cursor.current = next.workspace.workspaceSeq;
    updateView(next);
    window.dispatchEvent(new Event('attune:workspace-changed'));
    return { status: 'APPLIED', ...summarize(next) };
  };
  return { applyRepair, observe };
}

function inspectionTool(runtime: ToolRuntime): WebMcpTool {
  return {
    name: 'inspect_attune_workspace',
    title: 'Inspect AT-1042 authoritative state',
    description:
      'Read current AT-1042 validation, versions, capabilities, and human interventions observed since this tab last interacted. Returns no secrets.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(input) {
      validateEmptyInput(input);
      return summarize(await runtime.observe());
    },
  };
}

function comparisonTool(runtime: ToolRuntime): WebMcpTool {
  return {
    name: 'compare_valid_changes',
    title: 'Compare valid AT-1042 repairs',
    description:
      'Return deterministic slot-clearance repairs, predicted consequences, and any unseen human intervention before a repair is selected.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(input) {
      validateEmptyInput(input);
      return summarize(await runtime.observe());
    },
  };
}

function repairTool(runtime: ToolRuntime): WebMcpTool {
  return {
    name: 'apply_attune_repair',
    title: 'Apply selected AT-1042 repair',
    description:
      'Apply one offered deterministic repair through Attune’s shared command bus. Revalidates authoritative sequence and capability epoch; preserves all buyer-locked mounts.',
    inputSchema: {
      type: 'object',
      properties: {
        repair_id: {
          type: 'string',
          enum: ['move_slot_left_to_clearance', 'narrow_slot_to_clearance'],
          description: 'Exact repair identifier returned by compare_valid_changes.',
        },
      },
      required: ['repair_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      return runtime.applyRepair(readRepairId(input));
    },
  };
}

async function registerTools(
  context: WebMcpModelContext,
  capabilityIds: ReadonlySet<string>,
  runtime: ToolRuntime,
  signal: AbortSignal,
): Promise<void> {
  const tools = [inspectionTool(runtime)];
  if (capabilityIds.has('compare_valid_changes')) tools.push(comparisonTool(runtime));
  if (capabilityIds.has('apply_deterministic_repair')) tools.push(repairTool(runtime));
  await Promise.all(tools.map((tool) => Promise.resolve(context.registerTool(tool, { signal }))));
}

export function AttuneWebMcp() {
  const [registrationState, setRegistrationState] = useState<RegistrationState>('checking');
  const [view, setView] = useState<AttuneApiView | null>(null);
  const observationCursor = useRef(0);
  const refresh = useCallback(async () => setView(await requestView('/api/attune/webmcp')), []);
  const capabilityKey =
    view?.capabilities
      .map(({ id }) => id)
      .toSorted()
      .join('|') ?? '';

  useEffect(() => {
    void refresh().catch(() => setRegistrationState('failed'));
    const reload = () => void refresh().catch(() => setRegistrationState('failed'));
    window.addEventListener('attune:workspace-changed', reload);
    return () => window.removeEventListener('attune:workspace-changed', reload);
  }, [refresh]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) {
      setRegistrationState('unsupported');
      return undefined;
    }
    if (!capabilityKey) return undefined;
    const lifecycle = new AbortController();
    const runtime = createToolRuntime(observationCursor, setView);
    setRegistrationState('checking');
    void registerTools(context, new Set(capabilityKey.split('|')), runtime, lifecycle.signal).then(
      () => setRegistrationState('registered'),
      () => setRegistrationState('failed'),
    );
    return () => lifecycle.abort();
  }, [capabilityKey]);

  return (
    <aside className="webmcp-state" aria-live="polite">
      <span>Contextual WebMCP</span>
      <strong>{registrationState}</strong>
      {view ? <span>epoch {view.workspace.capabilityEpoch}</span> : null}
    </aside>
  );
}
