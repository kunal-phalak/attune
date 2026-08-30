'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  commandRequestBody,
  requestAttuneView,
  type AttuneApiView,
  type RepairId,
} from '../lib/attune-view';

type RegistrationState = 'checking' | 'registered' | 'unsupported' | 'failed';

interface ToolRuntime {
  readonly observe: () => Promise<AttuneApiView>;
  readonly execute: (
    command: Readonly<Record<string, unknown>>,
    requireNoIntervention?: boolean,
  ) => Promise<unknown>;
  readonly navigateToStorefront: () => Promise<unknown>;
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
  if (Object.keys(input).some((key) => key !== 'repair_id')) {
    throw new TypeError('The repair input contains unsupported fields.');
  }
  return value;
}

function readSlotPosition(input: unknown) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('center_x_mm and center_y_mm are required.');
  }
  const centerX = Reflect.get(input, 'center_x_mm');
  const centerY = Reflect.get(input, 'center_y_mm');
  if (
    typeof centerX !== 'number' ||
    !Number.isFinite(centerX) ||
    typeof centerY !== 'number' ||
    !Number.isFinite(centerY)
  ) {
    throw new TypeError('Slot coordinates must be finite millimetre values.');
  }
  if (Object.keys(input).some((key) => key !== 'center_x_mm' && key !== 'center_y_mm')) {
    throw new TypeError('The slot input contains unsupported fields.');
  }
  return { centerX, centerY };
}

function summarize(view: AttuneApiView) {
  return {
    commitment_id: view.workspace.commitmentId,
    workspace_seq: view.workspace.workspaceSeq,
    draft_version: view.workspace.draftVersion,
    capability_epoch: view.workspace.capabilityEpoch,
    spec_hash: view.specHash,
    valid: view.validation.valid,
    clearance_mm: view.validation.evidence.slotRightClearanceMm,
    required_clearance_mm: view.validation.evidence.requiredSlotClearanceMm,
    locked_mounts_preserved: `${view.validation.evidence.lockedMountsPreserved}/${view.validation.evidence.lockedMountsTotal}`,
    available_capabilities: view.capabilities,
    capability_frontier: view.frontier,
    latest_capability_transition: view.latestCapabilityTransition,
    human_interventions_since_last_observation: view.observation.interventions,
    deterministic_repairs: view.repairs,
    latest_receipt: view.latestReceipt,
    external_shopify_verification: view.records.externalVerifications.at(-1) ?? null,
    recent_rejections: view.records.commandRejections.slice(-5),
    measured_outcome: view.impact,
  };
}

function createToolRuntime(
  cursor: { current: number },
  updateView: (view: AttuneApiView) => void,
): ToolRuntime {
  const observe = async () => {
    const next = await requestAttuneView(`/api/attune/webmcp?cursor=${cursor.current}`);
    cursor.current = next.workspace.workspaceSeq;
    updateView(next);
    return next;
  };
  const execute = async (
    command: Readonly<Record<string, unknown>>,
    requireNoIntervention = true,
  ) => {
    const observed = await observe();
    if (requireNoIntervention && observed.observation.interventions.length > 0) {
      return {
        status: 'REVALIDATION_REQUIRED',
        reason: 'Human intervention was detected before execution.',
        ...summarize(observed),
      };
    }
    const next = await requestAttuneView('/api/attune/webmcp', {
      method: 'POST',
      body: commandRequestBody(observed, command, 'webmcp', cursor.current),
    });
    cursor.current = next.workspace.workspaceSeq;
    updateView(next);
    window.dispatchEvent(new Event('attune:workspace-changed'));
    return { status: 'APPLIED', ...summarize(next) };
  };
  const navigateToStorefront = async () => {
    const observed = await observe();
    const commerce = observed.workspace.commerceLinks.find(
      ({ revisionId, specHash }) =>
        revisionId === `r${observed.workspace.draftVersion}` && specHash === observed.specHash,
    );
    if (!commerce) {
      return {
        status: 'REVALIDATION_REQUIRED',
        reason: 'The current revision has no exact verified Shopify identity.',
        ...summarize(observed),
      };
    }
    const destination = commerce.verification.storefrontUrl;
    window.location.assign(destination);
    return {
      status: 'NAVIGATING_TOP_LEVEL',
      destination,
      revision_id: commerce.revisionId,
      spec_hash: commerce.specHash,
    };
  };
  return { execute, navigateToStorefront, observe };
}

function inspectionTool(runtime: ToolRuntime): WebMcpTool {
  return {
    name: 'inspect_attune_workspace',
    title: 'Inspect AT-1042 authoritative state',
    description:
      'Read current AT-1042 validation, capability frontier, immutable records, measured outcomes, and human interventions observed since this tab last interacted. Returns no secrets.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
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
      'Return deterministic slot-clearance repairs, predicted consequences, lock-preservation evidence, and any unseen human intervention before selection.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
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
      'Apply one offered deterministic repair through the shared command bus. Revalidates principal, sequence, capability epoch, specification hash, and unseen human intervention; preserves all buyer locks.',
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
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      return runtime.execute({
        type: 'apply_deterministic_repair',
        repairId: readRepairId(input),
      });
    },
  };
}

function editTool(runtime: ToolRuntime): WebMcpTool {
  return {
    name: 'move_attune_slot',
    title: 'Move the AT-1042 connector slot',
    description:
      'Move the editable connector slot in millimetres through the shared command bus. Predictably creates a new draft, increments the capability epoch, and revokes authority tied to the previous specification.',
    inputSchema: {
      type: 'object',
      properties: {
        center_x_mm: { type: 'number', description: 'Slot center X coordinate in millimetres.' },
        center_y_mm: { type: 'number', description: 'Slot center Y coordinate in millimetres.' },
      },
      required: ['center_x_mm', 'center_y_mm'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      const position = readSlotPosition(input);
      return runtime.execute({
        type: 'move_slot',
        centerX: position.centerX,
        centerY: position.centerY,
      });
    },
  };
}

function materializationTool(runtime: ToolRuntime): WebMcpTool {
  return {
    name: 'materialize_attune_revision',
    title: 'Materialize accepted r7 in Shopify',
    description:
      'Materialize the exact accepted AT-1042 r7 as one four-panel ₹2,400 Shopify lot. The server revalidates current authority, then requires Admin, publication, inventory, and Storefront conformance before recording VERIFIED.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      validateEmptyInput(input);
      return runtime.execute({ type: 'materialize_for_commerce', revisionId: 'r7' });
    },
  };
}

function navigationTool(runtime: ToolRuntime): WebMcpTool {
  return {
    name: 'open_verified_shopify_product',
    title: 'Open the verified Shopify Liquid product',
    description:
      'Navigate the top-level browser to the exact verified Shopify Liquid product. Attune tools leave with this document; Shopify-native browser WebMCP becomes the independent visible-session surface.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      validateEmptyInput(input);
      return runtime.navigateToStorefront();
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
  if (capabilityIds.has('edit_draft')) tools.push(editTool(runtime));
  if (capabilityIds.has('materialize_for_commerce')) tools.push(materializationTool(runtime));
  if (capabilityIds.has('navigate_to_storefront')) tools.push(navigationTool(runtime));
  await Promise.all(tools.map((tool) => Promise.resolve(context.registerTool(tool, { signal }))));
}

export function AttuneWebMcp() {
  const [registrationState, setRegistrationState] = useState<RegistrationState>('checking');
  const [view, setView] = useState<AttuneApiView | null>(null);
  const observationCursor = useRef(0);
  const refresh = useCallback(
    async () => setView(await requestAttuneView('/api/attune/webmcp')),
    [],
  );
  const capabilityKey =
    view?.capabilities
      .map(({ id }) => id)
      .toSorted()
      .join('|') ?? '';
  const workspaceReady = view !== null;

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
    if (!workspaceReady) return undefined;
    const lifecycle = new AbortController();
    const runtime = createToolRuntime(observationCursor, setView);
    setRegistrationState('checking');
    void registerTools(context, new Set(capabilityKey.split('|')), runtime, lifecycle.signal).then(
      () => setRegistrationState('registered'),
      () => setRegistrationState('failed'),
    );
    return () => lifecycle.abort();
  }, [capabilityKey, workspaceReady]);

  return (
    <aside className="webmcp-state" aria-live="polite">
      <span>Contextual WebMCP</span>
      <strong>{registrationState}</strong>
      {view ? <span>epoch {view.workspace.capabilityEpoch}</span> : null}
    </aside>
  );
}
