import { describe, expect, it, vi } from 'vitest';

import type { ToolRuntime } from './runtime';
import { parseModifyGeometryToolInput, registerAttuneTools, toolsForCapabilities } from './tools';

const unavailable = () => Promise.reject(new Error('Not used by this contract test.'));

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
      new Set(['edit_draft', 'compare_valid_changes', 'apply_deterministic_repair']),
      registration.signal,
    );

    expect(context.getTools()).toEqual([
      'check_design',
      'constrain_geometry',
      'find_makers',
      'forecast_change',
      'inspect_context',
      'inspect_quote_or_order',
      'manage_manufacturing_request',
      'modify_geometry',
      'navigate_workspace',
    ]);
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
    await navigation?.execute(
      { destination: 'maker_requests' },
      { signal: cancellation.signal },
    );
    expect(navigate).toHaveBeenCalledWith('maker_requests', cancellation.signal);
  });
});
