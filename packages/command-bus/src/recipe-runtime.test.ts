import { createAt1042Workspace, type AttuneCommand, type ConstraintSolver } from '@attune/domain';
import { createPlaneGcsSolver } from '@attune/domain/planegcs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AttuneCommandBus,
  authoritativeSemanticEnvelope,
  type AgentDelegation,
  type TrustedExecutionContext,
} from './index';

const WORKSPACE_ID = 'workspace:recipe-tests';
let solver: ConstraintSolver;

const human: TrustedExecutionContext = {
  path: 'human',
  workspaceId: WORKSPACE_ID,
  principalId: 'user:recipe-test',
  role: 'buyer',
};

const delegation: AgentDelegation = {
  id: 'delegation:recipe-test',
  workspaceId: WORKSPACE_ID,
  principalId: 'user:recipe-test',
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
  principalId: 'user:recipe-test',
  role: 'buyer',
  delegation,
};

function workspace() {
  return {
    ...createAt1042Workspace({ sketchTemplate: 'blank' }),
    workspaceSeq: 0,
    authorityEpoch: 0,
  };
}

function execute(
  bus: AttuneCommandBus,
  command: AttuneCommand,
  commandId: string,
  context: TrustedExecutionContext,
) {
  const observed = bus.inspect('buyer').workspace;
  return bus.execute(
    command,
    authoritativeSemanticEnvelope({ command, commandId, observed }),
    context,
  );
}

beforeAll(async () => {
  solver = await createPlaneGcsSolver();
});

afterAll(() => solver.dispose());

describe('recipe command execution', () => {
  const roundPlate: AttuneCommand = {
    type: 'instantiate_recipe',
    sourceRef: 'recipe:round:bus',
    recipe: 'round_plate',
    parameters: {
      outerDiameter: 160,
      centerBoreDiameter: 40,
      holePattern: { pitchCircleDiameter: 120, holeDiameter: 6, count: 4 },
    },
  };

  it('produces equivalent human and WebMCP semantic commits', () => {
    const humanBus = new AttuneCommandBus(workspace(), undefined, solver);
    const agentBus = new AttuneCommandBus(workspace(), undefined, solver);
    const humanResult = execute(humanBus, roundPlate, 'human-round', human);
    const agentResult = execute(agentBus, roundPlate, 'agent-round', agent);

    expect(agentResult.workspace.sketchDocument.entities).toEqual(
      humanResult.workspace.sketchDocument.entities,
    );
    expect(agentResult.receipt.specHashAfter).toBe(humanResult.receipt.specHashAfter);
    expect(agentResult.receipt.affectedEntities).toContain('recipe:round:bus');
  });

  it('updates recipe parameters by stable source reference and keeps stable entity IDs', () => {
    const bus = new AttuneCommandBus(workspace(), undefined, solver);
    const created = execute(
      bus,
      {
        type: 'instantiate_recipe',
        sourceRef: 'recipe:wheel:bus',
        recipe: 'spoked_wheel',
        parameters: { spokeCount: 6 },
      },
      'wheel-create',
      agent,
    );
    const root = created.workspace.sketchDocument.groups.find(
      ({ id }) => id === 'recipe:wheel:bus',
    )!;
    const boreBefore = created.workspace.sketchDocument.entities.find(
      ({ name }) => name === 'center-bore',
    )!;
    const updated = execute(
      bus,
      {
        type: 'update_recipe_parameters',
        sourceRef: root.id,
        expectedVersion: root.version,
        changes: { centerBoreDiameter: 30 },
      },
      'wheel-update',
      agent,
    );
    const boreAfter = updated.workspace.sketchDocument.entities.find(
      ({ id }) => id === boreBefore.id,
    );
    const boreNodeBefore = created.workspace.sketchDocument.nodes.find(
      ({ id }) => id === ('centerNodeId' in boreBefore ? boreBefore.centerNodeId : ''),
    );
    const boreNodeAfter = updated.workspace.sketchDocument.nodes.find(
      ({ id }) => id === boreNodeBefore?.id,
    );

    expect(boreAfter).toEqual(expect.objectContaining({ radius: 15, version: 2 }));
    expect(boreNodeAfter).toEqual(expect.objectContaining({ id: boreNodeBefore?.id, version: 2 }));
    expect(
      updated.workspace.sketchDocument.groups.find(({ id }) => id === root.id)?.sourceRef,
    ).toEqual(expect.objectContaining({ status: 'regenerated' }));
  });

  it('returns exact semantic refs and latest versions for overlapping changes', () => {
    const bus = new AttuneCommandBus(workspace(), undefined, solver);
    const created = execute(bus, roundPlate, 'conflict-create', human);
    const circle = created.workspace.sketchDocument.entities.find(
      ({ name }) => name === 'center-bore',
    )!;
    const staleCommand: AttuneCommand = {
      type: 'set_radius',
      target: { entityId: circle.id, expectedVersion: circle.version },
      radius: 24,
    };
    const staleEnvelope = authoritativeSemanticEnvelope({
      command: staleCommand,
      commandId: 'stale-radius',
      observed: created.workspace,
    });
    execute(
      bus,
      {
        type: 'set_radius',
        target: { entityId: circle.id, expectedVersion: circle.version },
        radius: 22,
      },
      'human-radius',
      human,
    );

    expect(() => bus.execute(staleCommand, staleEnvelope, agent)).toThrowError(
      expect.objectContaining({
        code: 'CONTEXT_CHANGED',
        changedEntities: [circle.id, 'recipe:round:bus'],
        latestVersions: { [circle.id]: 2, 'recipe:round:bus': 2 },
        canRetry: false,
      }),
    );
  });

  it('keeps generated geometry editable and prevents unsafe regeneration after a direct edit', () => {
    const bus = new AttuneCommandBus(workspace(), undefined, solver);
    const created = execute(
      bus,
      {
        type: 'instantiate_recipe',
        sourceRef: 'recipe:editable:bus',
        recipe: 'rounded_rectangle_plate',
        parameters: { width: 100, height: 60, cornerRadius: 8 },
      },
      'editable-create',
      human,
    );
    const arc = created.workspace.sketchDocument.entities.find(
      ({ name }) => name === 'outer-fillet-top-right',
    )!;
    const edited = execute(
      bus,
      {
        type: 'set_radius',
        target: { entityId: arc.id, expectedVersion: arc.version },
        radius: 5,
      },
      'editable-radius',
      human,
    );
    const root = edited.workspace.sketchDocument.groups.find(
      ({ id }) => id === 'recipe:editable:bus',
    )!;

    expect(edited.workspace.sketchDocument.entities.find(({ id }) => id === arc.id)).toEqual(
      expect.objectContaining({ radius: 5 }),
    );
    expect(root.sourceRef).toEqual(expect.objectContaining({ status: 'modified' }));
    expect(() =>
      execute(
        bus,
        {
          type: 'update_recipe_parameters',
          sourceRef: root.id,
          expectedVersion: root.version,
          changes: { cornerRadius: 6 },
        },
        'unsafe-regeneration',
        agent,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'COMMAND_CONFLICT',
        changedEntities: [root.id],
      }),
    );
  });
});
