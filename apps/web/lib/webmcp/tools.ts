import type { RepairId } from '../attune-view';
import type { AgentContextFocus, ToolRuntime } from './runtime';
import { CONSTRAINT_SCHEMA, DIMENSION_SCHEMA, GEOMETRY_SCHEMA, GROUP_SCHEMA } from './schemas';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}

function exact(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const unsupported = Object.keys(value).filter((key) => !keys.includes(key));
  if (unsupported.length > 0) {
    throw new TypeError(`${name} contains unsupported fields: ${unsupported.join(', ')}.`);
  }
}

function collection(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new TypeError(`${name} must contain between 1 and 200 items.`);
  }
  return value;
}

function strings(value: unknown, name: string): readonly string[] {
  return collection(value, name).map((candidate) => {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      throw new TypeError(`${name} must contain stable public references.`);
    }
    return candidate;
  });
}

function empty(input: unknown): void {
  if (input === undefined || input === null) return;
  const value = object(input, 'tool input');
  exact(value, [], 'tool input');
}

function finite(candidate: unknown, name: string): number {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new TypeError(`${name} must be finite.`);
  }
  return candidate;
}

function focus(input: unknown): AgentContextFocus {
  if (input === undefined || input === null) return {};
  const value = object(input, 'inspect_context input');
  exact(value, ['entity_ids', 'group_ids', 'region'], 'inspect_context input');
  const region = value.region === undefined ? undefined : object(value.region, 'region');
  if (region) exact(region, ['min_x', 'min_y', 'max_x', 'max_y'], 'region');
  return {
    ...(value.entity_ids ? { entityIds: strings(value.entity_ids, 'entity_ids') } : {}),
    ...(value.group_ids ? { groupIds: strings(value.group_ids, 'group_ids') } : {}),
    ...(region
      ? {
          region: {
            minX: finite(region.min_x, 'region.min_x'),
            minY: finite(region.min_y, 'region.min_y'),
            maxX: finite(region.max_x, 'region.max_x'),
            maxY: finite(region.max_y, 'region.max_y'),
          },
        }
      : {}),
  };
}

function modifyCommand(input: unknown): Readonly<Record<string, unknown>> {
  const value = object(input, 'modify_geometry input');
  const operation = value.operation;
  if (operation === 'create_geometry') {
    exact(value, ['operation', 'entities', 'group_id'], 'create_geometry input');
    return {
      type: operation,
      entities: collection(value.entities, 'entities'),
      ...(typeof value.group_id === 'string' ? { groupId: value.group_id } : {}),
    };
  }
  if (operation === 'edit_geometry') {
    exact(value, ['operation', 'entities'], 'edit_geometry input');
    return { type: operation, entities: collection(value.entities, 'entities') };
  }
  if (operation === 'delete_geometry') {
    exact(value, ['operation', 'entity_ids'], 'delete_geometry input');
    return { type: operation, entityIds: strings(value.entity_ids, 'entity_ids') };
  }
  if (operation === 'create_group') {
    exact(value, ['operation', 'groups'], 'create_group input');
    return { type: operation, groups: collection(value.groups, 'groups') };
  }
  if (operation === 'move_to_group') {
    exact(value, ['operation', 'entity_ids', 'group_id'], 'move_to_group input');
    if (typeof value.group_id !== 'string') throw new TypeError('group_id is required.');
    return {
      type: operation,
      entityIds: strings(value.entity_ids, 'entity_ids'),
      groupId: value.group_id,
    };
  }
  throw new TypeError('modify_geometry.operation is unsupported.');
}

function constraintCommand(input: unknown): Readonly<Record<string, unknown>> {
  const value = object(input, 'constrain_geometry input');
  if (value.operation === 'apply_constraint') {
    exact(value, ['operation', 'constraints'], 'apply_constraint input');
    return {
      type: value.operation,
      constraints: collection(value.constraints, 'constraints'),
    };
  }
  if (value.operation === 'remove_constraint') {
    exact(value, ['operation', 'constraint_ids'], 'remove_constraint input');
    return {
      type: value.operation,
      constraintIds: strings(value.constraint_ids, 'constraint_ids'),
    };
  }
  if (value.operation === 'set_dimension') {
    exact(value, ['operation', 'dimensions'], 'set_dimension input');
    return {
      type: value.operation,
      dimensions: collection(value.dimensions, 'dimensions'),
    };
  }
  throw new TypeError('constrain_geometry.operation is unsupported.');
}

function repairId(input: unknown): RepairId {
  const value = object(input, 'repair input');
  exact(value, ['repair_id'], 'repair input');
  if (
    value.repair_id !== 'move_slot_left_to_clearance' &&
    value.repair_id !== 'narrow_slot_to_clearance'
  ) {
    throw new TypeError('repair_id is unsupported.');
  }
  return value.repair_id;
}

function semanticTools(runtime: ToolRuntime): readonly WebMcpTool[] {
  return [
    {
      name: 'inspect_context',
      title: 'Inspect semantic sketch context',
      description:
        'Read compact authoritative sketch context by stable entity IDs, group IDs, or world region, including solver DOF, ranked candidates, actions, and unseen human changes.',
      inputSchema: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          group_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          region: {
            type: 'object',
            properties: {
              min_x: { type: 'number' },
              min_y: { type: 'number' },
              max_x: { type: 'number' },
              max_y: { type: 'number' },
            },
            required: ['min_x', 'min_y', 'max_x', 'max_y'],
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input, execution) {
        return runtime.observe(focus(input), execution?.signal);
      },
    },
    {
      name: 'forecast_change',
      title: 'Forecast a semantic sketch change',
      description:
        'Forecast one proposed semantic command against current authority without committing. Uses the same command application, PlaneGCS solve, validation, and capability compilation as commit.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'object',
            properties: { type: { type: 'string' } },
            required: ['type'],
            additionalProperties: true,
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input, execution) {
        const value = object(input, 'forecast_change input');
        exact(value, ['command'], 'forecast_change input');
        return runtime.forecast(object(value.command, 'command'), execution?.signal);
      },
    },
    {
      name: 'check_design',
      title: 'Check semantic sketch design',
      description:
        'Return compact current solver status, conflicts, degrees of freedom, constraint candidates, and available semantic actions without mutation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input, execution) {
        empty(input);
        return runtime.observe({}, execution?.signal);
      },
    },
  ];
}

function editingTools(runtime: ToolRuntime): readonly WebMcpTool[] {
  return [
    {
      name: 'modify_geometry',
      title: 'Batch modify semantic geometry',
      description:
        'Create, edit, or delete batches of Point, Line, Circle, and Arc entities, or create/move groups. One server request forecasts, solves, safely rebases disjoint edits, and commits through the command bus.',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: [
              'create_geometry',
              'edit_geometry',
              'delete_geometry',
              'create_group',
              'move_to_group',
            ],
          },
          entities: { type: 'array', minItems: 1, maxItems: 200, items: GEOMETRY_SCHEMA },
          entity_ids: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string' } },
          groups: { type: 'array', minItems: 1, maxItems: 200, items: GROUP_SCHEMA },
          group_id: { type: 'string' },
        },
        required: ['operation'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input, execution) {
        return runtime.execute(modifyCommand(input), execution?.signal);
      },
    },
    {
      name: 'constrain_geometry',
      title: 'Batch constrain semantic geometry',
      description:
        'Apply/remove deterministic constraints or set dimensions in one typed batch. Unsupported PlaneGCS projections return diagnostics and do not commit.',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['apply_constraint', 'remove_constraint', 'set_dimension'],
          },
          constraints: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: CONSTRAINT_SCHEMA,
          },
          constraint_ids: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: { type: 'string' },
          },
          dimensions: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: DIMENSION_SCHEMA,
          },
        },
        required: ['operation'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input, execution) {
        return runtime.execute(constraintCommand(input), execution?.signal);
      },
    },
  ];
}

function legacyTools(runtime: ToolRuntime, capabilityIds: ReadonlySet<string>): WebMcpTool[] {
  const tools: WebMcpTool[] = [];
  if (capabilityIds.has('compare_valid_changes')) {
    tools.push({
      name: 'compare_valid_changes',
      description: 'Compare deterministic AT-1042 provider-valid repairs without mutation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input, execution) {
        empty(input);
        return (await runtime.observeWorkspace(execution?.signal)).repairs;
      },
    });
  }
  if (capabilityIds.has('apply_deterministic_repair')) {
    tools.push({
      name: 'apply_attune_repair',
      description: 'Apply one offered deterministic AT-1042 repair through the command bus.',
      inputSchema: {
        type: 'object',
        properties: {
          repair_id: {
            type: 'string',
            enum: ['move_slot_left_to_clearance', 'narrow_slot_to_clearance'],
          },
        },
        required: ['repair_id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input, execution) {
        return runtime.execute(
          { type: 'apply_deterministic_repair', repairId: repairId(input) },
          execution?.signal,
        );
      },
    });
  }
  if (capabilityIds.has('edit_draft')) {
    tools.push({
      name: 'move_attune_slot',
      description: 'Move the legacy AT-1042 connector slot through the shared command bus.',
      inputSchema: {
        type: 'object',
        properties: { center_x_mm: { type: 'number' }, center_y_mm: { type: 'number' } },
        required: ['center_x_mm', 'center_y_mm'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input, execution) {
        const value = object(input, 'move_attune_slot input');
        exact(value, ['center_x_mm', 'center_y_mm'], 'move_attune_slot input');
        return runtime.execute(
          { type: 'move_slot', centerX: value.center_x_mm, centerY: value.center_y_mm },
          execution?.signal,
        );
      },
    });
  }
  if (capabilityIds.has('materialize_for_commerce')) {
    tools.push({
      name: 'materialize_attune_revision',
      description: 'Materialize the exact accepted AT-1042 r7 through the existing Shopify seam.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input, execution) {
        empty(input);
        return runtime.execute(
          { type: 'materialize_for_commerce', revisionId: 'r7' },
          execution?.signal,
        );
      },
    });
  }
  if (capabilityIds.has('navigate_to_storefront')) {
    tools.push({
      name: 'open_verified_shopify_product',
      description: 'Navigate to the exact verified Shopify storefront product.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input, execution) {
        empty(input);
        return runtime.navigateToStorefront(execution?.signal);
      },
    });
  }
  return tools;
}

export function toolsForCapabilities(
  runtime: ToolRuntime,
  capabilityIds: ReadonlySet<string>,
): readonly WebMcpTool[] {
  return [
    ...semanticTools(runtime),
    ...(capabilityIds.has('edit_draft') ? editingTools(runtime) : []),
    ...legacyTools(runtime, capabilityIds),
  ];
}

export function toolNamesForCapabilities(capabilityIds: ReadonlySet<string>): readonly string[] {
  const names = ['inspect_context', 'forecast_change', 'check_design'];
  if (capabilityIds.has('edit_draft')) names.push('modify_geometry', 'constrain_geometry');
  if (capabilityIds.has('compare_valid_changes')) names.push('compare_valid_changes');
  if (capabilityIds.has('apply_deterministic_repair')) names.push('apply_attune_repair');
  if (capabilityIds.has('edit_draft')) names.push('move_attune_slot');
  if (capabilityIds.has('materialize_for_commerce')) names.push('materialize_attune_revision');
  if (capabilityIds.has('navigate_to_storefront')) names.push('open_verified_shopify_product');
  return names;
}

export async function registerAttuneTools(
  context: WebMcpModelContext,
  runtime: ToolRuntime,
  capabilityIds: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<void> {
  await Promise.all(
    toolsForCapabilities(runtime, capabilityIds).map((tool) =>
      Promise.resolve(context.registerTool(tool, { signal })),
    ),
  );
}
