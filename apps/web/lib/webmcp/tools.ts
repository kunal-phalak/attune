import type { AgentContextFocus, ToolRuntime } from './runtime';
import {
  CONSTRAINT_SCHEMA,
  DESIGN_REQUEST_SCHEMA,
  DIMENSION_SCHEMA,
  GEOMETRY_SCHEMA,
  GROUP_SCHEMA,
  RECIPE_PARAMETERS_SCHEMA,
  RECIPE_PLACEMENT_SCHEMA,
  VERSIONED_TARGET_SCHEMA,
} from './schemas';

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

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a stable public reference.`);
  }
  return value;
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

function withToolDispatchTiming(result: unknown, startedAt: number): unknown {
  if (typeof result !== 'object' || result === null) return result;
  const existing = Reflect.get(result, 'timings');
  return {
    ...result,
    timings: {
      ...(typeof existing === 'object' && existing !== null ? existing : {}),
      tool_dispatch: Math.max(0, performance.now() - startedAt),
    },
  };
}

function focus(input: unknown): AgentContextFocus {
  if (input === undefined || input === null) return {};
  const value = object(input, 'inspect_context input');
  exact(
    value,
    [
      'entity_ids',
      'node_ids',
      'constraint_ids',
      'group_ids',
      'active_group_id',
      'active_human_tool',
      'region',
    ],
    'inspect_context input',
  );
  const region = value.region === undefined ? undefined : object(value.region, 'region');
  if (region) exact(region, ['min_x', 'min_y', 'max_x', 'max_y'], 'region');
  return {
    ...(value.entity_ids ? { entityIds: strings(value.entity_ids, 'entity_ids') } : {}),
    ...(value.node_ids ? { nodeIds: strings(value.node_ids, 'node_ids') } : {}),
    ...(value.constraint_ids
      ? { constraintIds: strings(value.constraint_ids, 'constraint_ids') }
      : {}),
    ...(value.group_ids ? { groupIds: strings(value.group_ids, 'group_ids') } : {}),
    ...(value.active_group_id
      ? { activeGroupId: string(value.active_group_id, 'active_group_id') }
      : {}),
    ...(value.active_human_tool
      ? { activeHumanTool: string(value.active_human_tool, 'active_human_tool') }
      : {}),
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

export function parseModifyGeometryToolInput(input: unknown): Readonly<Record<string, unknown>> {
  const value = object(input, 'modify_geometry input');
  const operation = value.operation;
  if (operation === 'instantiate_recipe') {
    exact(
      value,
      ['operation', 'recipe', 'parameters', 'placement', 'design_spec'],
      'instantiate_recipe input',
    );
    return {
      type: operation,
      sourceRef: `recipe:${string(value.recipe, 'recipe')}:${crypto.randomUUID()}`,
      recipe: value.recipe,
      parameters: object(value.parameters, 'parameters'),
      ...(value.placement !== undefined ? { placement: object(value.placement, 'placement') } : {}),
      ...(value.design_spec !== undefined
        ? { designRequest: object(value.design_spec, 'design_spec') }
        : {}),
    };
  }
  if (operation === 'update_recipe_parameters') {
    exact(
      value,
      ['operation', 'source_ref', 'expected_version', 'changes'],
      'update_recipe_parameters input',
    );
    return {
      type: operation,
      sourceRef: string(value.source_ref, 'source_ref'),
      ...(value.expected_version !== undefined
        ? { expectedVersion: finite(value.expected_version, 'expected_version') }
        : {}),
      changes: object(value.changes, 'changes'),
    };
  }
  if (operation === 'set_radius') {
    exact(value, ['operation', 'target', 'radius'], 'set_radius input');
    return {
      type: operation,
      target: object(value.target, 'target'),
      radius: finite(value.radius, 'radius'),
    };
  }
  if (operation === 'create_geometry') {
    exact(
      value,
      ['operation', 'entities', 'group_id', 'group', 'constraints'],
      'create_geometry input',
    );
    return {
      type: operation,
      entities: collection(value.entities, 'entities'),
      ...(typeof value.group_id === 'string' ? { groupId: value.group_id } : {}),
      ...(value.group !== undefined ? { group: object(value.group, 'group') } : {}),
      ...(value.constraints !== undefined
        ? { constraints: collection(value.constraints, 'constraints') }
        : {}),
    };
  }
  if (operation === 'edit_geometry') {
    exact(value, ['operation', 'entities'], 'edit_geometry input');
    return { type: operation, entities: collection(value.entities, 'entities') };
  }
  if (operation === 'move_node') {
    exact(value, ['operation', 'node_id', 'position'], 'move_node input');
    if (typeof value.node_id !== 'string' || value.node_id.length === 0) {
      throw new TypeError('node_id is required.');
    }
    return { type: operation, nodeId: value.node_id, position: object(value.position, 'position') };
  }
  if (operation === 'transform_geometry') {
    exact(
      value,
      ['operation', 'entity_ids', 'pivot', 'translation', 'rotation', 'scale'],
      'transform_geometry input',
    );
    return {
      type: operation,
      entityIds: strings(value.entity_ids, 'entity_ids'),
      pivot: object(value.pivot, 'pivot'),
      ...(value.translation !== undefined
        ? { translation: object(value.translation, 'translation') }
        : {}),
      ...(value.rotation !== undefined ? { rotation: finite(value.rotation, 'rotation') } : {}),
      ...(value.scale !== undefined ? { scale: finite(value.scale, 'scale') } : {}),
    };
  }
  if (operation === 'trim_geometry') {
    exact(value, ['operation', 'entity_id', 'pick_point'], 'trim_geometry input');
    if (typeof value.entity_id !== 'string' || value.entity_id.length === 0) {
      throw new TypeError('entity_id is required.');
    }
    return {
      type: operation,
      entityId: value.entity_id,
      pickPoint: object(value.pick_point, 'pick_point'),
    };
  }
  if (operation === 'delete_geometry') {
    exact(value, ['operation', 'entity_ids'], 'delete_geometry input');
    return { type: operation, entityIds: strings(value.entity_ids, 'entity_ids') };
  }
  if (operation === 'set_construction') {
    exact(value, ['operation', 'entity_ids', 'construction'], 'set_construction input');
    if (typeof value.construction !== 'boolean') throw new TypeError('construction is required.');
    return {
      type: operation,
      entityIds: strings(value.entity_ids, 'entity_ids'),
      construction: value.construction,
    };
  }
  if (operation === 'create_group') {
    exact(value, ['operation', 'groups'], 'create_group input');
    return { type: operation, groups: collection(value.groups, 'groups') };
  }
  if (operation === 'rename_group') {
    exact(value, ['operation', 'group_id', 'name'], 'rename_group input');
    if (typeof value.group_id !== 'string' || typeof value.name !== 'string') {
      throw new TypeError('group_id and name are required.');
    }
    return { type: operation, groupId: value.group_id, name: value.name };
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
  if (value.operation === 'set_tangent') {
    exact(value, ['operation', 'targets'], 'set_tangent input');
    const targets = collection(value.targets, 'targets');
    if (targets.length !== 2) throw new TypeError('set_tangent requires exactly two targets.');
    return {
      type: value.operation,
      targets: targets.map((target) => object(target, 'target')),
      constraintId: `constraint:tangent:${crypto.randomUUID()}`,
    };
  }
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
  if (value.operation === 'remove_dimension') {
    exact(value, ['operation', 'dimension_ids'], 'remove_dimension input');
    return {
      type: value.operation,
      dimensionIds: strings(value.dimension_ids, 'dimension_ids'),
    };
  }
  throw new TypeError('constrain_geometry.operation is unsupported.');
}

function semanticTools(runtime: ToolRuntime): readonly WebMcpTool[] {
  return [
    {
      name: 'inspect_context',
      title: 'Inspect semantic sketch context',
      description:
        'Read compact authoritative sketch context by stable entity, node, constraint, or group IDs and world region, including nearby semantic refs, active human tool, solver DOF, ranked candidates, relevant actions, and unseen human changes.',
      inputSchema: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          node_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          constraint_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          group_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          active_group_id: { type: 'string' },
          active_human_tool: { type: 'string' },
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
      async execute(input, execution) {
        const startedAt = performance.now();
        const result = await runtime.observe(focus(input), execution?.signal);
        return withToolDispatchTiming(result, startedAt);
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
      async execute(input, execution) {
        const startedAt = performance.now();
        const value = object(input, 'forecast_change input');
        exact(value, ['command'], 'forecast_change input');
        const result = await runtime.forecast(object(value.command, 'command'), execution?.signal);
        return withToolDispatchTiming(result, startedAt);
      },
    },
    {
      name: 'check_design',
      title: 'Check semantic sketch design',
      description:
        'Return compact current solver status, conflicts, degrees of freedom, constraint candidates, and available semantic actions without mutation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input, execution) {
        const startedAt = performance.now();
        empty(input);
        const result = await runtime.observe({}, execution?.signal);
        return withToolDispatchTiming(result, startedAt);
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
        'Instantiate or update deterministic mechanical recipes, set a circle or arc radius by stable versioned target, or batch lower-level semantic geometry edits. Prefer instantiate_recipe for common mechanical structures; one request generates analytic Attune geometry, solves, safely rebases disjoint edits, and commits.',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: [
              'instantiate_recipe',
              'update_recipe_parameters',
              'set_radius',
              'create_geometry',
              'edit_geometry',
              'move_node',
              'transform_geometry',
              'trim_geometry',
              'delete_geometry',
              'set_construction',
              'create_group',
              'rename_group',
              'move_to_group',
            ],
          },
          recipe: {
            type: 'string',
            enum: [
              'round_plate',
              'annular_ring',
              'rounded_rectangle_plate',
              'mounting_plate',
              'bolt_circle',
              'slotted_plate',
              'spoked_wheel',
              'radial_pattern',
            ],
          },
          parameters: RECIPE_PARAMETERS_SCHEMA,
          placement: RECIPE_PLACEMENT_SCHEMA,
          design_spec: DESIGN_REQUEST_SCHEMA,
          source_ref: { type: 'string' },
          expected_version: { type: 'integer', minimum: 0 },
          changes: { type: 'object', additionalProperties: true },
          target: VERSIONED_TARGET_SCHEMA,
          radius: { type: 'number', exclusiveMinimum: 0 },
          entities: { type: 'array', minItems: 1, maxItems: 200, items: GEOMETRY_SCHEMA },
          constraints: { type: 'array', minItems: 1, maxItems: 200, items: CONSTRAINT_SCHEMA },
          entity_ids: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string' } },
          entity_id: { type: 'string' },
          group: GROUP_SCHEMA,
          groups: { type: 'array', minItems: 1, maxItems: 200, items: GROUP_SCHEMA },
          group_id: { type: 'string' },
          name: { type: 'string', minLength: 1, maxLength: 160 },
          node_id: { type: 'string' },
          position: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y'],
            additionalProperties: false,
          },
          pivot: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y'],
            additionalProperties: false,
          },
          translation: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y'],
            additionalProperties: false,
          },
          pick_point: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y'],
            additionalProperties: false,
          },
          rotation: { type: 'number' },
          scale: { type: 'number', exclusiveMinimum: 0 },
          construction: { type: 'boolean' },
        },
        required: ['operation'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, execution) {
        const startedAt = performance.now();
        const result = await runtime.execute(
          parseModifyGeometryToolInput(input),
          execution?.signal,
        );
        return withToolDispatchTiming(result, startedAt);
      },
    },
    {
      name: 'constrain_geometry',
      title: 'Batch constrain semantic geometry',
      description:
        'Apply/remove deterministic constraints, set dimensions, or make one selected line tangent to one selected circle or arc using versioned targets. Unsupported PlaneGCS projections return diagnostics and do not commit.',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: [
              'set_tangent',
              'apply_constraint',
              'remove_constraint',
              'set_dimension',
              'remove_dimension',
            ],
          },
          targets: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: VERSIONED_TARGET_SCHEMA,
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
          dimension_ids: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: { type: 'string' },
          },
        },
        required: ['operation'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, execution) {
        const startedAt = performance.now();
        const result = await runtime.execute(constraintCommand(input), execution?.signal);
        return withToolDispatchTiming(result, startedAt);
      },
    },
  ];
}

function manufacturingConfiguration(input: unknown): Readonly<Record<string, unknown>> {
  const value = object(input, 'manufacturing configuration');
  exact(
    value,
    ['material', 'thickness_mm', 'finish', 'quantity', 'tolerance_mm'],
    'manufacturing configuration',
  );
  if (value.material !== 'aluminium' && value.material !== 'acrylic') {
    throw new TypeError('material must be aluminium or acrylic.');
  }
  const thicknessMm = finite(value.thickness_mm, 'thickness_mm');
  const quantity = finite(value.quantity, 'quantity');
  const toleranceMm = finite(value.tolerance_mm, 'tolerance_mm');
  if (thicknessMm <= 0 || !Number.isInteger(quantity) || quantity < 1 || toleranceMm <= 0) {
    throw new TypeError('Manufacturing dimensions and quantity must be positive.');
  }
  return {
    material: value.material,
    thicknessMm,
    finish: string(value.finish, 'finish'),
    quantity,
    toleranceMm,
  };
}

function quoteTerms(input: Record<string, unknown>) {
  const amountMinor = finite(input.amount_minor, 'amount_minor');
  const leadTimeDays = finite(input.lead_time_days, 'lead_time_days');
  const currency = string(input.currency, 'currency').toUpperCase();
  const validUntil = string(input.valid_until, 'valid_until');
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    !Number.isSafeInteger(leadTimeDays) ||
    leadTimeDays < 1 ||
    leadTimeDays > 365 ||
    !/^[A-Z]{3}$/.test(currency) ||
    !Number.isFinite(Date.parse(validUntil))
  ) {
    throw new TypeError('Quote terms are invalid.');
  }
  return { amountMinor, currency, leadTimeDays, validUntil };
}

function requireCapability(capabilityIds: ReadonlySet<string>, capabilityId: string): void {
  if (!capabilityIds.has(capabilityId)) {
    throw new Error(`The current principal does not have ${capabilityId} authority.`);
  }
}

function manufacturingTools(
  runtime: ToolRuntime,
  capabilityIds: ReadonlySet<string>,
): readonly WebMcpTool[] {
  const tools: WebMcpTool[] = [
    {
      name: 'find_makers',
      title: 'Find makers for this design',
      description:
        'Read the live Shopify-connected maker identity and locations, clearly labeled demo marketplace profiles, connection capability boundaries, and current design fit. Does not claim live data when the provider connection fails.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input, execution) {
        const startedAt = performance.now();
        empty(input);
        if (!runtime.marketplace) throw new Error('Marketplace access is unavailable.');
        const result = await runtime.marketplace(execution?.signal);
        if (!isRecord(result)) return withToolDispatchTiming(result, startedAt);
        const connection = isRecord(result.connection) ? result.connection : {};
        return withToolDispatchTiming(
          {
            verifiedAt: connection.verifiedAt,
            connectedShop: connection.shop,
            providerCapabilities: connection.capabilities,
            providerProfile: result.providerProfile,
            providers: result.providers,
          },
          startedAt,
        );
      },
    },
    {
      name: 'inspect_quote_or_order',
      title: 'Inspect a quote or order',
      description:
        'Read linked manufacturing requests, exact saved versions, quotes, acceptances, and verified Shopify Draft Orders without mutation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input, execution) {
        const startedAt = performance.now();
        empty(input);
        if (!runtime.current) throw new Error('Manufacturing order access is unavailable.');
        const view = await runtime.current(execution?.signal);
        return withToolDispatchTiming(
          {
            workspaceSequence: view.workspace.workspaceSeq,
            draftVersion: view.workspace.draftVersion,
            specificationHash: view.specHash,
            manufacturingConfiguration: view.workspace.manufacturingConfiguration,
            provider: view.workspace.providerCapabilityProfile,
            requests: view.workspace.manufacturingRequests,
            savedVersions: view.workspace.savedVersions.map((version) => ({
              versionId: version.versionId,
              versionNumber: version.versionNumber,
              name: version.name,
              specificationHash: version.specHash,
              previewStatus: version.preview.status,
            })),
            quotes: view.workspace.quotes,
            acceptances: view.workspace.acceptances,
            shopifyDraftOrders: view.workspace.externalCommerceRecords,
          },
          startedAt,
        );
      },
    },
    {
      name: 'navigate_workspace',
      title: 'Navigate the Attune workspace',
      description:
        'Navigate to a reversible Attune destination. The server derives and revalidates the required Buyer or Maker authority; changing perspective never grants authority.',
      inputSchema: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            enum: ['design', 'marketplace', 'buyer_orders', 'maker_requests', 'maker_profile'],
          },
        },
        required: ['destination'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input, execution) {
        const startedAt = performance.now();
        const value = object(input, 'navigate_workspace input');
        exact(value, ['destination'], 'navigate_workspace input');
        if (
          value.destination !== 'design' &&
          value.destination !== 'marketplace' &&
          value.destination !== 'buyer_orders' &&
          value.destination !== 'maker_requests' &&
          value.destination !== 'maker_profile'
        ) {
          throw new TypeError('destination is unsupported.');
        }
        if (!runtime.navigate) throw new Error('Workspace navigation is unavailable.');
        const result = await runtime.navigate(value.destination, execution?.signal);
        return withToolDispatchTiming(result, startedAt);
      },
    },
    {
      name: 'manage_manufacturing_request',
      title: 'Manage a manufacturing request',
      description:
        'Configure, bind an exact version, submit or revise a request, prepare Maker quote terms, or accept an exact quote. Maker quote sending stays an explicit human action and Buyer acceptance requires confirmed user intent.',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: [
              'configure',
              'select_version',
              'submit',
              'request_changes',
              'prepare_quote',
              'finalize_quote',
              'accept_quote',
            ],
          },
          configuration: {
            type: 'object',
            properties: {
              material: { type: 'string', enum: ['aluminium', 'acrylic'] },
              thickness_mm: { type: 'number', exclusiveMinimum: 0 },
              finish: { type: 'string', minLength: 1, maxLength: 120 },
              quantity: { type: 'integer', minimum: 1, maximum: 10000 },
              tolerance_mm: { type: 'number', exclusiveMinimum: 0 },
            },
            required: ['material', 'thickness_mm', 'finish', 'quantity', 'tolerance_mm'],
            additionalProperties: false,
          },
          version_id: { type: 'string' },
          request_id: { type: 'string' },
          note: { type: 'string', maxLength: 500 },
          amount_minor: { type: 'integer', minimum: 1 },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          lead_time_days: { type: 'integer', minimum: 1, maximum: 365 },
          valid_until: { type: 'string' },
          revision_id: { type: 'string' },
          quote_id: { type: 'string' },
          user_confirmed: { type: 'boolean' },
        },
        required: ['operation'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, execution) {
        const startedAt = performance.now();
        const value = object(input, 'manage_manufacturing_request input');
        const operation = string(value.operation, 'operation');
        if (!runtime.current) throw new Error('Manufacturing access is unavailable.');

        if (operation === 'configure') {
          exact(value, ['operation', 'configuration'], 'configure input');
          requireCapability(capabilityIds, 'request_quote');
          return withToolDispatchTiming(
            {
              status: 'CONFIGURATION_READY',
              configuration: manufacturingConfiguration(value.configuration),
              nextAction: 'Select an exact version, then submit after informing the user.',
            },
            startedAt,
          );
        }

        if (operation === 'select_version') {
          exact(value, ['operation', 'version_id'], 'select_version input');
          requireCapability(capabilityIds, 'request_quote');
          const versionId = string(value.version_id, 'version_id');
          const view = await runtime.current(execution?.signal);
          if (versionId === 'current_draft') {
            return withToolDispatchTiming(
              {
                status: 'CURRENT_DRAFT_SELECTED',
                nextAction: 'Submitting will atomically save and bind a new immutable version.',
              },
              startedAt,
            );
          }
          const version = view.workspace.savedVersions.find(
            (candidate) => candidate.versionId === versionId,
          );
          if (!version) throw new Error('The selected saved version does not exist.');
          return withToolDispatchTiming(
            {
              status: 'EXACT_VERSION_SELECTED',
              versionId: version.versionId,
              versionNumber: version.versionNumber,
              specificationHash: version.specHash,
              previewStatus: version.preview.status,
            },
            startedAt,
          );
        }

        if (operation === 'submit') {
          exact(value, ['operation', 'configuration', 'version_id'], 'submit input');
          requireCapability(capabilityIds, 'request_quote');
          const versionId =
            value.version_id === undefined ? 'current_draft' : string(value.version_id, 'version_id');
          const result = await runtime.execute(
            {
              type: 'request_quote',
              configuration: manufacturingConfiguration(value.configuration),
              ...(versionId === 'current_draft' ? {} : { versionId }),
            },
            execution?.signal,
          );
          return withToolDispatchTiming(result, startedAt);
        }

        if (operation === 'request_changes') {
          exact(
            value,
            ['operation', 'request_id', 'note', 'configuration'],
            'request_changes input',
          );
          requireCapability(capabilityIds, 'request_quote');
          const result = await runtime.execute(
            {
              type: 'request_changes',
              requestId: string(value.request_id, 'request_id'),
              ...(typeof value.note === 'string' && value.note.trim()
                ? { note: value.note.trim() }
                : {}),
              ...(value.configuration
                ? { configuration: manufacturingConfiguration(value.configuration) }
                : {}),
            },
            execution?.signal,
          );
          return withToolDispatchTiming(result, startedAt);
        }

        if (operation === 'prepare_quote' || operation === 'finalize_quote') {
          exact(
            value,
            ['operation', 'amount_minor', 'currency', 'lead_time_days', 'valid_until'],
            `${operation} input`,
          );
          requireCapability(capabilityIds, 'freeze_and_quote_revision');
          const view = await runtime.current(execution?.signal);
          const request = view.workspace.manufacturingRequests.findLast((candidate) =>
            ['PROVIDER_REVIEW_REQUESTED', 'CHANGES_REQUESTED'].includes(candidate.status),
          );
          if (!request) throw new Error('No active Maker request is ready to quote.');
          return withToolDispatchTiming(
            {
              status: 'HUMAN_CONFIRMATION_REQUIRED',
              operation,
              requestId: request.requestId,
              versionId: request.versionId,
              versionNumber: request.versionNumber,
              specificationHash: request.specHash,
              quoteTerms: quoteTerms(value),
              nextAction: 'Open Maker requests and have the Maker explicitly select Send quote.',
            },
            startedAt,
          );
        }

        if (operation === 'accept_quote') {
          exact(
            value,
            ['operation', 'revision_id', 'quote_id', 'user_confirmed'],
            'accept_quote input',
          );
          requireCapability(capabilityIds, 'accept_revision');
          if (value.user_confirmed !== true) {
            return withToolDispatchTiming(
              {
                status: 'USER_CONFIRMATION_REQUIRED',
                nextAction: 'Ask the Buyer to explicitly confirm acceptance of this exact quote.',
              },
              startedAt,
            );
          }
          const result = await runtime.execute(
            {
              type: 'accept_revision',
              revisionId: string(value.revision_id, 'revision_id'),
              quoteId: string(value.quote_id, 'quote_id'),
            },
            execution?.signal,
          );
          return withToolDispatchTiming(result, startedAt);
        }

        throw new TypeError('manage_manufacturing_request.operation is unsupported.');
      },
    },
  ];
  return tools;
}

export function toolsForCapabilities(
  runtime: ToolRuntime,
  capabilityIds: ReadonlySet<string>,
): readonly WebMcpTool[] {
  return [
    ...semanticTools(runtime),
    ...(capabilityIds.has('edit_draft') ? editingTools(runtime) : []),
    ...manufacturingTools(runtime, capabilityIds),
  ];
}

export function toolNamesForCapabilities(capabilityIds: ReadonlySet<string>): readonly string[] {
  const names = ['inspect_context', 'forecast_change', 'check_design'];
  if (capabilityIds.has('edit_draft')) names.push('modify_geometry', 'constrain_geometry');
  names.push(
    'find_makers',
    'inspect_quote_or_order',
    'manage_manufacturing_request',
    'navigate_workspace',
  );
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
