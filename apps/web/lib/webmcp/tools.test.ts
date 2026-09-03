import { describe, expect, it, vi } from 'vitest';

import type { ToolRuntime } from './runtime';
import { parseModifyGeometryToolInput, registerAttuneTools, toolsForCapabilities } from './tools';

const unavailable = () => Promise.reject(new Error('Not used by this contract test.'));

function toolPropertyEnum(tool: unknown, property: string): unknown {
  if (typeof tool !== 'object' || tool === null) return undefined;
  const schema = Reflect.get(tool, 'inputSchema');
  if (typeof schema !== 'object' || schema === null) return undefined;
  const properties = Reflect.get(schema, 'properties');
  if (typeof properties !== 'object' || properties === null) return undefined;
  const propertySchema = Reflect.get(properties, property);
  return typeof propertySchema === 'object' && propertySchema !== null
    ? Reflect.get(propertySchema, 'enum')
    : undefined;
}

describe('compact WebMCP geometry mutation surface', () => {
  it('represents a complete round plate as one typed recipe operation', () => {
    expect(
      parseModifyGeometryToolInput({
        operation: 'instantiate_recipe',
        recipe: 'round_plate',
        parameters: {
          outerDiameter: 160,
          centerBoreDiameter: 40,
          holePattern: { pitchCircleDiameter: 120, holeDiameter: 6, count: 4 },
        },
        design_spec: { purpose: 'mounting plate', materialIntent: 'aluminium' },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'instantiate_recipe',
        sourceRef: expect.stringMatching(/^recipe:round_plate:/),
        recipe: 'round_plate',
        parameters: {
          outerDiameter: 160,
          centerBoreDiameter: 40,
          holePattern: { pitchCircleDiameter: 120, holeDiameter: 6, count: 4 },
        },
        designRequest: { purpose: 'mounting plate', materialIntent: 'aluminium' },
      }),
    );
  });

  it('uses a small versioned target for a radius mutation', () => {
    expect(
      parseModifyGeometryToolInput({
        operation: 'set_radius',
        target: { entityId: 'arc:inner-fillet:3', expectedVersion: 4 },
        radius: 5,
      }),
    ).toEqual({
      type: 'set_radius',
      target: { entityId: 'arc:inner-fillet:3', expectedVersion: 4 },
      radius: 5,
    });
  });
  it('represents a shared-node movement without exposing renderer or solver objects', () => {
    expect(
      parseModifyGeometryToolInput({
        operation: 'move_node',
        node_id: 'sketch:node:stable',
        position: { x: 12.5, y: -3 },
      }),
    ).toEqual({
      type: 'move_node',
      nodeId: 'sketch:node:stable',
      position: { x: 12.5, y: -3 },
    });
  });

  it('rejects transient editor and PlaneGCS state', () => {
    expect(() =>
      parseModifyGeometryToolInput({
        operation: 'move_node',
        node_id: 'sketch:node:stable',
        position: { x: 12.5, y: -3 },
        temporary_constraint: { type: 'coordinate_x' },
      }),
    ).toThrow(/unsupported fields/);
  });

  it('represents semantic create, transform, and trim operations without pointer events', () => {
    expect(
      parseModifyGeometryToolInput({
        operation: 'create_geometry',
        entities: [{ id: 'circle:1', kind: 'circle', center: { x: 50, y: 40 }, radius: 20 }],
      }),
    ).toEqual({
      type: 'create_geometry',
      entities: [{ id: 'circle:1', kind: 'circle', center: { x: 50, y: 40 }, radius: 20 }],
    });
    expect(
      parseModifyGeometryToolInput({
        operation: 'transform_geometry',
        entity_ids: ['circle:1'],
        pivot: { x: 50, y: 40 },
        rotation: Math.PI / 6,
        scale: 1.2,
      }),
    ).toEqual({
      type: 'transform_geometry',
      entityIds: ['circle:1'],
      pivot: { x: 50, y: 40 },
      rotation: Math.PI / 6,
      scale: 1.2,
    });
    expect(
      parseModifyGeometryToolInput({
        operation: 'trim_geometry',
        entity_id: 'circle:1',
        pick_point: { x: 50, y: 60 },
      }),
    ).toEqual({
      type: 'trim_geometry',
      entityId: 'circle:1',
      pickPoint: { x: 50, y: 60 },
    });
  });
});

describe('native model-context registration contract', () => {
  it('keeps viewer tools read-only and scopes Buyer and Maker destinations independently', () => {
    const runtime: ToolRuntime = {
      observe: vi.fn(unavailable),
      execute: vi.fn(unavailable),
      forecast: vi.fn(unavailable),
    };
    const viewerTools = toolsForCapabilities(runtime, new Set());
    expect(viewerTools.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining([
        'modify_geometry',
        'constrain_geometry',
        'manage_manufacturing_request',
      ]),
    );
    const viewerAccount = viewerTools.find(({ name }) => name === 'manage_account');
    expect(viewerAccount?.annotations?.readOnlyHint).toBe(true);
    expect(toolPropertyEnum(viewerAccount, 'operation')).toEqual(['inspect_setup']);

    const buyerNavigation = toolsForCapabilities(runtime, new Set(['request_quote'])).find(
      ({ name }) => name === 'navigate_workspace',
    );
    const buyerDestinations = toolPropertyEnum(buyerNavigation, 'destination');
    expect(buyerDestinations).toEqual([
      'design',
      'find_makers',
      'buyer_requests',
      'buyer_orders',
      'settings',
    ]);

    const makerNavigation = toolsForCapabilities(
      runtime,
      new Set(['freeze_and_quote_revision']),
    ).find(({ name }) => name === 'navigate_workspace');
    const makerDestinations = toolPropertyEnum(makerNavigation, 'destination');
    expect(makerDestinations).toEqual([
      'design',
      'find_makers',
      'maker_requests',
      'maker_jobs',
      'maker_profile',
      'settings',
    ]);
  });

  it('adds dashboard, flow, and guarded reset tools only for the judge control surface', () => {
    const runtime: ToolRuntime = {
      observe: vi.fn(unavailable),
      execute: vi.fn(unavailable),
      forecast: vi.fn(unavailable),
      resetReview: vi.fn(unavailable),
    };
    const tools = toolsForCapabilities(runtime, new Set(['request_quote', 'accept_revision']), {
      surface: 'review_control_center',
      judgeMode: true,
    });
    const names = tools.map(({ name }) => name);
    const navigation = tools.find(({ name }) => name === 'navigate_workspace');
    const reset = tools.find(({ name }) => name === 'reset_judge_workspace');

    expect(names).toEqual(
      expect.arrayContaining([
        'navigate_workspace',
        'inspect_review_flow',
        'reset_judge_workspace',
      ]),
    );
    expect(toolPropertyEnum(navigation, 'destination')).toEqual([
      'dashboard',
      'review_control_center',
      'design',
      'find_makers',
      'buyer_requests',
      'buyer_orders',
      'settings',
    ]);
    expect(reset?.annotations).toEqual(
      expect.objectContaining({ destructiveHint: true, idempotentHint: true }),
    );
  });

  it('exposes stable tools and executes geometry and constraint schemas with AbortSignal', async () => {
    const execute = vi.fn(async (command: Readonly<Record<string, unknown>>) => ({
      status: 'APPLIED',
      command,
    }));
    const runtime: ToolRuntime = {
      observe: vi.fn(unavailable),
      execute,
      forecast: vi.fn(unavailable),
    };
    const registered = new Map<string, WebMcpTool>();
    const registrationSignals: AbortSignal[] = [];
    const context: WebMcpModelContext & {
      getTools(): readonly string[];
      executeTool(name: string, input: unknown, signal: AbortSignal): Promise<unknown>;
    } = {
      registerTool(tool, options) {
        registered.set(tool.name, tool);
        if (options?.signal) registrationSignals.push(options.signal);
      },
      getTools: () => [...registered.keys()].toSorted(),
      async executeTool(name, input, signal) {
        const tool = registered.get(name);
        if (!tool) throw new Error(`Unknown tool ${name}.`);
        return tool.execute(input, { signal });
      },
    };
    const registration = new AbortController();
    await registerAttuneTools(
      context,
      runtime,
      new Set([
        'edit_draft',
        'compare_valid_changes',
        'apply_deterministic_repair',
        'request_quote',
        'accept_revision',
      ]),
      registration.signal,
    );

    expect(context.getTools()).toEqual([
      'check_design',
      'constrain_geometry',
      'find_makers',
      'forecast_change',
      'inspect_context',
      'manage_account',
      'manage_manufacturing_request',
      'modify_geometry',
      'navigate_workspace',
    ]);
    for (const tool of registered.values()) {
      expect(tool.description).toMatch(/^Use /);
      expect(tool.description.length).toBeLessThanOrEqual(500);
      expect(tool.description).not.toContain('Do not use');
      expect(tool.annotations).toEqual(
        expect.objectContaining({
          readOnlyHint: expect.any(Boolean),
          destructiveHint: expect.any(Boolean),
          idempotentHint: expect.any(Boolean),
          openWorldHint: expect.any(Boolean),
        }),
      );
    }
    const navigationSchema = registered.get('navigate_workspace')?.inputSchema;
    const destination =
      navigationSchema &&
      navigationSchema.properties !== null &&
      typeof navigationSchema.properties === 'object'
        ? Reflect.get(navigationSchema.properties, 'destination')
        : undefined;
    expect(destination).toEqual(
      expect.objectContaining({
        enum: ['design', 'find_makers', 'buyer_requests', 'buyer_orders', 'settings'],
      }),
    );
    expect(registrationSignals.every((signal) => signal === registration.signal)).toBe(true);

    const execution = new AbortController();
    await context.executeTool(
      'modify_geometry',
      {
        operation: 'create_geometry',
        entities: [{ id: 'point:webmcp', kind: 'point', position: { x: 4, y: 8 } }],
      },
      execution.signal,
    );
    await context.executeTool(
      'constrain_geometry',
      {
        operation: 'apply_constraint',
        constraints: [
          {
            id: 'constraint:webmcp:fixed',
            type: 'fixed',
            refs: [{ entityId: 'point:webmcp' }],
          },
        ],
      },
      execution.signal,
    );
    await context.executeTool(
      'constrain_geometry',
      {
        operation: 'set_tangent',
        targets: [
          { entityId: 'line:webmcp', expectedVersion: 1 },
          { entityId: 'arc:webmcp', expectedVersion: 2 },
        ],
      },
      execution.signal,
    );

    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'create_geometry' }),
      execution.signal,
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'apply_constraint' }),
      execution.signal,
    );
    expect(execute).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ type: 'set_tangent' }),
      execution.signal,
    );
  });

  it('keeps manufacturing compact, confirms acceptance, and forwards navigation cancellation', async () => {
    const execute = vi.fn(async () => ({ status: 'APPLIED' }));
    const navigate = vi.fn(async (surface: string) => ({
      status: 'NAVIGATION_INITIATED',
      fromSurface: 'marketplace',
      toSurface: surface,
      perspective: 'provider',
      authorityUnchanged: true,
    }));
    const runtime: ToolRuntime = {
      current: vi.fn(unavailable),
      observe: vi.fn(unavailable),
      execute,
      forecast: vi.fn(unavailable),
      navigate,
    };
    const tools = toolsForCapabilities(
      runtime,
      new Set(['request_quote', 'accept_revision', 'freeze_and_quote_revision']),
    );
    const manage = tools.find(({ name }) => name === 'manage_manufacturing_request');
    const navigation = tools.find(({ name }) => name === 'navigate_workspace');
    expect(manage).toBeDefined();
    expect(navigation?.annotations?.readOnlyHint).toBe(false);

    await expect(
      manage?.execute({
        operation: 'configure',
        configuration: {
          material: 'aluminium',
          thickness_mm: 3,
          finish: 'Mill finish',
          quantity: 4,
          tolerance_mm: 0.2,
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'CONFIGURATION_READY' }));
    await expect(
      manage?.execute({
        operation: 'accept_quote',
        revision_id: 'r6',
        quote_id: 'quote:6',
        user_confirmed: false,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'USER_CONFIRMATION_REQUIRED' }));
    expect(execute).not.toHaveBeenCalled();

    const cancellation = new AbortController();
    await navigation?.execute({ destination: 'maker_requests' }, { signal: cancellation.signal });
    expect(navigate).toHaveBeenCalledWith('maker_requests', cancellation.signal);
  });

  it('discloses only state-valid operations on each commerce surface', () => {
    const runtime: ToolRuntime = {
      current: vi.fn(unavailable),
      observe: vi.fn(unavailable),
      execute: vi.fn(unavailable),
      forecast: vi.fn(unavailable),
    };

    const makerTools = toolsForCapabilities(
      runtime,
      new Set(['freeze_and_quote_revision']),
      { surface: 'provider_requests' },
      new Set(['freeze_and_quote_revision']),
    );
    expect(makerTools.map(({ name }) => name)).toEqual([
      'navigate_workspace',
      'manage_manufacturing_request',
      'inspect_commerce_pipeline',
      'manage_account',
    ]);
    expect(
      toolPropertyEnum(
        makerTools.find(({ name }) => name === 'manage_manufacturing_request'),
        'operation',
      ),
    ).toEqual(['prepare_quote', 'finalize_quote']);

    const buyerTools = toolsForCapabilities(
      runtime,
      new Set(['request_changes', 'accept_revision']),
      { surface: 'buyer_orders', checkoutAvailable: true },
      new Set(['request_quote', 'request_changes', 'accept_revision']),
    );
    expect(buyerTools.map(({ name }) => name)).toEqual([
      'navigate_workspace',
      'manage_manufacturing_request',
      'inspect_commerce_pipeline',
      'prepare_customer_checkout',
      'manage_account',
    ]);
    expect(
      toolPropertyEnum(
        buyerTools.find(({ name }) => name === 'manage_manufacturing_request'),
        'operation',
      ),
    ).toEqual(['request_changes', 'accept_quote']);

    const designTools = toolsForCapabilities(runtime, new Set(['edit_draft']), {
      surface: 'design',
    });
    expect(designTools.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(['inspect_commerce_pipeline', 'prepare_customer_checkout']),
    );
  });

  it('requires explicit confirmation before quote finalization and checkout handoff', async () => {
    const current = vi.fn(unavailable);
    const execute = vi.fn(async () => ({ status: 'APPLIED' }));
    const runtime: ToolRuntime = {
      current,
      observe: vi.fn(unavailable),
      execute,
      forecast: vi.fn(unavailable),
    };
    const maker = toolsForCapabilities(runtime, new Set(['freeze_and_quote_revision']), {
      surface: 'provider_requests',
    }).find(({ name }) => name === 'manage_manufacturing_request');
    const quote = {
      operation: 'finalize_quote',
      amount_minor: 825_000,
      currency: 'INR',
      lead_time_days: 14,
      valid_until: '2026-10-01T00:00:00.000Z',
    };

    await expect(maker?.execute({ ...quote, user_confirmed: false })).resolves.toEqual(
      expect.objectContaining({ status: 'USER_CONFIRMATION_REQUIRED' }),
    );
    expect(execute).not.toHaveBeenCalled();
    await expect(maker?.execute({ ...quote, user_confirmed: true })).resolves.toEqual(
      expect.objectContaining({ status: 'APPLIED' }),
    );
    expect(execute).toHaveBeenCalledWith(
      {
        type: 'freeze_and_quote_revision',
        amountMinor: 825_000,
        currency: 'INR',
        leadTimeDays: 14,
        validUntil: '2026-10-01T00:00:00.000Z',
      },
      undefined,
    );

    const checkout = toolsForCapabilities(runtime, new Set(), {
      surface: 'provider_jobs',
      checkoutAvailable: true,
    }).find(({ name }) => name === 'prepare_customer_checkout');
    await expect(checkout?.execute({ user_confirmed: false })).resolves.toEqual(
      expect.objectContaining({ status: 'USER_CONFIRMATION_REQUIRED' }),
    );
    expect(current).not.toHaveBeenCalled();
  });
});
