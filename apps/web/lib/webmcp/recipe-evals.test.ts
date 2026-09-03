import {
  AttuneCommandBus,
  authoritativeSemanticEnvelope,
  type AgentDelegation,
  type TrustedExecutionContext,
} from '@attune/command-bus';
import {
  createAt1042Workspace,
  isSketchCommand,
  type AttuneCommand,
  type ConstraintSolver,
} from '@attune/domain';
import { createPlaneGcsSolver } from '@attune/domain/planegcs';
import { compileAgentContext, compileAgentMutationResult } from '@attune/webmcp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AgentContextFocus, ToolRuntime } from './runtime';
import { registerAttuneTools } from './tools';

type EvalEntity = ReturnType<
  MechanicalEvalRuntime['bus']['inspect']
>['workspace']['sketchDocument']['entities'][number];

function circleEntities(entities: readonly EvalEntity[]) {
  return entities.filter(
    (entity): entity is Extract<EvalEntity, { kind: 'circle' }> => entity.kind === 'circle',
  );
}

function geometrySummary(entities: readonly EvalEntity[]) {
  return {
    entityCount: entities.length,
    lines: entities.filter(({ kind }) => kind === 'line').length,
    arcs: entities.filter(({ kind }) => kind === 'arc').length,
    circles: entities.filter(({ kind }) => kind === 'circle').length,
    circleRadii: circleEntities(entities)
      .map(({ radius }) => radius)
      .toSorted((left, right) => left - right),
  };
}

function recordAcceptance(value: Readonly<Record<string, unknown>>): void {
  if (process.env.ATTUNE_RECORD_WEBMCP_EVALS === '1') {
    console.warn(`WEBMCP_EVAL_RECORD ${JSON.stringify(value)}`);
  }
}

function parsedSketchCommand(command: Readonly<Record<string, unknown>>): AttuneCommand {
  const type = command.type;
  if (typeof type !== 'string') throw new TypeError('A sketch command type is required.');
  const candidate = { ...command, type };
  if (!isSketchCommand(candidate)) throw new TypeError(`Unsupported sketch command ${type}.`);
  return candidate;
}

const WORKSPACE_ID = 'workspace:recipe-eval';
let solver: ConstraintSolver;

const delegation: AgentDelegation = {
  id: 'delegation:recipe-eval',
  workspaceId: WORKSPACE_ID,
  principalId: 'user:recipe-eval',
  capabilityIds: ['edit_draft'],
  authorityEpoch: 0,
  issuedAt: '2026-09-03T00:00:00.000Z',
  expiresAt: '2026-09-23T00:00:00.000Z',
  consentExpiresAt: '2026-09-23T00:00:00.000Z',
  revokedAt: null,
  observationCursor: 0,
};

const agent: TrustedExecutionContext = {
  path: 'webmcp',
  workspaceId: WORKSPACE_ID,
  principalId: 'user:recipe-eval',
  role: 'buyer',
  delegation,
};

class MechanicalEvalRuntime implements ToolRuntime {
  readonly bus: AttuneCommandBus;
  phaseTimings: Record<string, number> = {};

  constructor() {
    this.bus = new AttuneCommandBus(
      { ...createAt1042Workspace({ sketchTemplate: 'blank' }), authorityEpoch: 0 },
      undefined,
      solver,
      {},
      (name, durationMs) => {
        this.phaseTimings[name] = durationMs;
      },
    );
  }

  observe = async (focus: AgentContextFocus = {}) => {
    const startedAt = performance.now();
    const inspection = this.bus.inspect('buyer');
    const context = compileAgentContext({
      workspace: inspection.workspace,
      role: 'buyer',
      capabilityIds: ['edit_draft'],
      observation: inspection.observation,
      delegation: { status: 'active', authorityEpoch: 0 },
      focus,
    });
    this.phaseTimings.context_compilation = performance.now() - startedAt;
    return { ...context, timings: { ...this.phaseTimings } };
  };

  execute = async (command: Readonly<Record<string, unknown>>) => {
    this.phaseTimings = {};
    const typed = parsedSketchCommand(command);
    const observed = this.bus.inspect('buyer').workspace;
    const result = this.bus.execute(
      typed,
      authoritativeSemanticEnvelope({
        command: typed,
        commandId: `eval-${crypto.randomUUID()}`,
        observed,
      }),
      agent,
    );
    const changedEntityIds = result.receipt.affectedEntities
      .filter((id) => result.workspace.sketchDocument.entities.some((entity) => entity.id === id))
      .slice(0, 16);
    const context = await this.observe({ entityIds: changedEntityIds });
    return {
      ...compileAgentMutationResult(result, context, ['edit_draft']),
      timings: { ...this.phaseTimings },
    };
  };

  forecast = async (command: Readonly<Record<string, unknown>>) =>
    this.bus.forecast(parsedSketchCommand(command), agent, `forecast-${crypto.randomUUID()}`);

  seed(command: AttuneCommand) {
    return this.execute(command);
  }
}

function nativeContext() {
  const tools = new Map<string, WebMcpTool>();
  const calls: { readonly name: string; readonly input: unknown; readonly result: unknown }[] = [];
  const context: WebMcpModelContext & {
    getTools(): readonly string[];
    executeTool(name: string, input: unknown): Promise<unknown>;
  } = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    getTools: () => [...tools.keys()].toSorted(),
    async executeTool(name, input) {
      const tool = tools.get(name);
      if (!tool) throw new TypeError(`Unknown native WebMCP tool ${name}.`);
      const result = await tool.execute(input);
      calls.push({ name, input, result });
      return result;
    },
  };
  return { calls, context };
}

beforeAll(async () => {
  solver = await createPlaneGcsSolver();
});

afterAll(() => solver.dispose());

describe('focused native WebMCP mechanical acceptance prompts', () => {
  it.each([
    {
      prompt:
        'Create a 160 mm round mounting plate with a 40 mm center bore and four 6 mm holes on a 120 mm bolt circle.',
      recipe: 'round_plate',
      parameters: {
        outerDiameter: 160,
        centerBoreDiameter: 40,
        holePattern: { pitchCircleDiameter: 120, holeDiameter: 6, count: 4 },
      },
      assertGeometry: (
        entities: ReturnType<
          MechanicalEvalRuntime['bus']['inspect']
        >['workspace']['sketchDocument']['entities'],
      ) => {
        const circles = circleEntities(entities);
        expect(circles).toHaveLength(6);
        expect(circles.map(({ radius }) => radius).toSorted((a, b) => a - b)).toEqual([
          3, 3, 3, 3, 20, 80,
        ]);
      },
    },
    {
      prompt:
        'Create a 120 × 80 mm mounting plate with 10 mm rounded corners and four 5 mm holes 15 mm from each corner.',
      recipe: 'mounting_plate',
      parameters: {
        width: 120,
        height: 80,
        cornerRadius: 10,
        holeDiameter: 5,
        holeSpacingX: 90,
        holeSpacingY: 50,
      },
      assertGeometry: (
        entities: ReturnType<
          MechanicalEvalRuntime['bus']['inspect']
        >['workspace']['sketchDocument']['entities'],
      ) => {
        expect(entities.filter(({ kind }) => kind === 'line')).toHaveLength(4);
        expect(entities.filter(({ kind }) => kind === 'arc')).toHaveLength(4);
        expect(entities.filter(({ kind }) => kind === 'circle')).toHaveLength(4);
      },
    },
    {
      prompt: 'Create an annular ring with 100 mm OD and 60 mm ID.',
      recipe: 'annular_ring',
      parameters: { outerDiameter: 100, innerDiameter: 60 },
      assertGeometry: (
        entities: ReturnType<
          MechanicalEvalRuntime['bus']['inspect']
        >['workspace']['sketchDocument']['entities'],
      ) => {
        expect(
          circleEntities(entities)
            .map(({ radius }) => radius)
            .toSorted((a, b) => a - b),
        ).toEqual([30, 50]);
      },
    },
    {
      prompt: 'Create a six-spoke wheel and make the center bore 30 mm.',
      recipe: 'spoked_wheel',
      parameters: { spokeCount: 6, centerBoreDiameter: 30 },
      assertGeometry: (
        entities: ReturnType<
          MechanicalEvalRuntime['bus']['inspect']
        >['workspace']['sketchDocument']['entities'],
      ) => {
        expect(entities.find(({ name }) => name === 'center-bore')).toEqual(
          expect.objectContaining({ kind: 'circle', radius: 15 }),
        );
      },
    },
  ])('$prompt', async ({ prompt, recipe, parameters, assertGeometry }) => {
    const runtime = new MechanicalEvalRuntime();
    const native = nativeContext();
    await registerAttuneTools(
      native.context,
      runtime,
      new Set(['edit_draft']),
      new AbortController().signal,
    );

    const startedAt = performance.now();
    const result = await native.context.executeTool('modify_geometry', {
      operation: 'instantiate_recipe',
      recipe,
      parameters,
    });

    expect(native.context.getTools()).toEqual([
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
    expect(native.calls).toHaveLength(1);
    expect(native.calls[0]).toEqual(
      expect.objectContaining({
        name: 'modify_geometry',
        input: expect.objectContaining({ operation: 'instantiate_recipe', recipe, parameters }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'APPLIED',
        recipeProvenance: [expect.objectContaining({ recipe })],
        timings: expect.objectContaining({
          tool_dispatch: expect.any(Number),
          recipe_instantiation: expect.any(Number),
          plane_gcs: expect.any(Number),
          forecast: expect.any(Number),
          context_compilation: expect.any(Number),
        }),
      }),
    );
    const finalGeometry = runtime.bus.inspect('buyer').workspace.sketchDocument.entities;
    assertGeometry(finalGeometry);
    recordAcceptance({
      prompt,
      toolCalls: native.calls.map(({ name }) => name),
      parameters,
      result: 'APPLIED',
      executionMs: performance.now() - startedAt,
      finalSemanticGeometry: geometrySummary(finalGeometry),
    });
  });

  it('changes a selected fillet radius through inspect then one semantic mutation', async () => {
    const runtime = new MechanicalEvalRuntime();
    await runtime.seed({
      type: 'instantiate_recipe',
      sourceRef: 'recipe:selected-fillet',
      recipe: 'rounded_rectangle_plate',
      parameters: { width: 100, height: 60, cornerRadius: 8 },
    });
    const native = nativeContext();
    await registerAttuneTools(
      native.context,
      runtime,
      new Set(['edit_draft']),
      new AbortController().signal,
    );
    const arc = runtime.bus
      .inspect('buyer')
      .workspace.sketchDocument.entities.find(({ name }) => name === 'outer-fillet-top-right')!;

    const startedAt = performance.now();
    const context = await native.context.executeTool('inspect_context', { entity_ids: [arc.id] });
    expect(context).toEqual(
      expect.objectContaining({
        geometry: [
          expect.objectContaining({
            id: arc.id,
            semanticRole: 'outer_fillet',
            relevantActions: expect.arrayContaining(['set_radius']),
          }),
        ],
      }),
    );
    await native.context.executeTool('modify_geometry', {
      operation: 'set_radius',
      target: { entityId: arc.id, expectedVersion: arc.version },
      radius: 5,
    });

    expect(native.calls.map(({ name }) => name)).toEqual(['inspect_context', 'modify_geometry']);
    expect(
      runtime.bus
        .inspect('buyer')
        .workspace.sketchDocument.entities.find(({ id }) => id === arc.id),
    ).toEqual(expect.objectContaining({ radius: 5 }));
    recordAcceptance({
      prompt: 'Change this selected fillet radius to 5 mm.',
      toolCalls: native.calls.map(({ name }) => name),
      parameters: { target: arc.id, expectedVersion: arc.version, radius: 5 },
      result: 'APPLIED',
      executionMs: performance.now() - startedAt,
      finalSemanticGeometry: { semanticRole: 'outer_fillet', radius: 5 },
    });
  });

  it('makes a selected line tangent to a selected arc through the ranked semantic action', async () => {
    const runtime = new MechanicalEvalRuntime();
    await runtime.seed({
      type: 'instantiate_recipe',
      sourceRef: 'recipe:selected-tangent',
      recipe: 'rounded_rectangle_plate',
      parameters: { width: 100, height: 60, cornerRadius: 8 },
    });
    const native = nativeContext();
    await registerAttuneTools(
      native.context,
      runtime,
      new Set(['edit_draft']),
      new AbortController().signal,
    );
    const entities = runtime.bus.inspect('buyer').workspace.sketchDocument.entities;
    const line = entities.find(({ name }) => name === 'plate-boundary-top')!;
    const arc = entities.find(({ name }) => name === 'outer-fillet-top-right')!;

    const startedAt = performance.now();
    const context = await native.context.executeTool('inspect_context', {
      entity_ids: [line.id, arc.id],
    });
    expect(context).toEqual(
      expect.objectContaining({
        relevantActions: expect.arrayContaining(['set_tangent']),
        candidates: expect.arrayContaining([
          expect.objectContaining({ type: 'tangent', score: 0.995 }),
        ]),
      }),
    );
    await native.context.executeTool('constrain_geometry', {
      operation: 'set_tangent',
      targets: [
        { entityId: line.id, expectedVersion: line.version },
        { entityId: arc.id, expectedVersion: arc.version },
      ],
    });

    expect(native.calls.map(({ name }) => name)).toEqual(['inspect_context', 'constrain_geometry']);
    expect(
      runtime.bus
        .inspect('buyer')
        .workspace.sketchDocument.constraints.some(
          ({ type, refs }) =>
            type === 'tangent' &&
            refs.some(({ entityId }) => entityId === line.id) &&
            refs.some(({ entityId }) => entityId === arc.id),
        ),
    ).toBe(true);
    recordAcceptance({
      prompt: 'Make this selected line tangent to this arc.',
      toolCalls: native.calls.map(({ name }) => name),
      parameters: { targets: [line.id, arc.id] },
      result: 'APPLIED',
      executionMs: performance.now() - startedAt,
      finalSemanticGeometry: { relationship: 'tangent', refs: [line.id, arc.id] },
    });
  });
});
