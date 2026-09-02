import {
  createAt1042Workspace,
  hashCanonical,
  rectangleCreation,
  type AttuneCommand,
  type ConstraintSolver,
} from '@attune/domain';
import { createPlaneGcsSolver } from '@attune/domain/planegcs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AttuneCommandBus,
  authoritativeSemanticEnvelope,
  type DelegationGrant,
  type TrustedExecutionContext,
} from './index';

const FIXED_TIME = '2026-09-01T12:00:00.000Z';
const WORKSPACE_ID = 'workspace:at-1042';
let solver: ConstraintSolver;

const human: TrustedExecutionContext = {
  path: 'human',
  workspaceId: WORKSPACE_ID,
  principalId: 'buyer:semantic-test',
  role: 'buyer',
};

function delegation(capabilityIds: DelegationGrant['capabilityIds']): DelegationGrant {
  return {
    grantId: 'delegation:semantic-test',
    delegatingPrincipalId: 'buyer:semantic-test',
    delegatedPrincipalId: 'agent:semantic-test',
    role: 'buyer',
    workspaceId: WORKSPACE_ID,
    capabilityIds,
    issuedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-09-23T00:00:00.000Z',
    revokedAt: null,
    observationCursor: 0,
  };
}

const agent: TrustedExecutionContext = {
  path: 'webmcp',
  workspaceId: WORKSPACE_ID,
  principalId: 'agent:semantic-test',
  role: 'buyer',
  delegation: delegation(['edit_draft']),
};

function editCircle(
  workspace: ReturnType<AttuneCommandBus['inspect']>['workspace'],
  circleIndex: number,
  radius: number,
): Extract<AttuneCommand, { type: 'edit_geometry' }> {
  const entity = workspace.sketchDocument.entities.filter(({ kind }) => kind === 'circle')[
    circleIndex
  ];
  if (!entity || entity.kind !== 'circle') throw new TypeError('Missing circle test fixture.');
  return {
    type: 'edit_geometry',
    entities: [{ id: entity.id, kind: 'circle', center: entity.center, radius }],
  };
}

function semanticEnvelope(
  bus: AttuneCommandBus,
  observed: ReturnType<AttuneCommandBus['inspect']>['workspace'],
  command: AttuneCommand,
  commandId: string,
) {
  return authoritativeSemanticEnvelope({ command, commandId, observed });
}

beforeAll(async () => {
  solver = await createPlaneGcsSolver();
});

afterAll(() => solver.dispose());

describe('semantic forecast and shared human/WebMCP execution', () => {
  it('produces identical semantic after-hashes for equivalent human and WebMCP commands', () => {
    const humanBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const agentBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const humanObserved = humanBus.inspect('buyer').workspace;
    const agentObserved = agentBus.inspect('buyer').workspace;
    const command = editCircle(humanObserved, 0, 112);

    const humanResult = humanBus.execute(
      command,
      semanticEnvelope(humanBus, humanObserved, command, 'semantic-equivalent'),
      human,
    );
    const agentResult = agentBus.execute(
      command,
      semanticEnvelope(agentBus, agentObserved, command, 'semantic-equivalent'),
      agent,
    );

    expect(humanResult.receipt.afterHash).toBe(agentResult.receipt.afterHash);
    expect(humanResult.receipt.specHashAfter).toBe(agentResult.receipt.specHashAfter);
    expect(humanResult.receipt.origin).toBe('human_ui');
    expect(agentResult.receipt.origin).toBe('webmcp');
  });

  it('keeps forecast pure and commits the exact forecast consequence', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = bus.inspect('buyer').workspace;
    const command = editCircle(observed, 1, 24);
    const authoritativeBefore = hashCanonical(bus.inspect('buyer').workspace);
    const forecast = bus.forecast(command, human, 'semantic-forecast');

    expect(hashCanonical(bus.inspect('buyer').workspace)).toBe(authoritativeBefore);
    const committed = bus.execute(
      command,
      semanticEnvelope(bus, observed, command, 'semantic-commit'),
      human,
    );
    expect(committed.receipt.afterHash).toBe(forecast.afterHash);
    expect(committed.receipt.consequence).toEqual(forecast);
  });

  it('produces the same authoritative node movement for human and WebMCP execution', () => {
    const humanBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const agentBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = humanBus.inspect('buyer').workspace;
    const node = observed.sketchDocument.nodes.find(
      (candidate) => (candidate.sourceRefs?.length ?? 0) > 1,
    )!;
    const command: AttuneCommand = {
      type: 'move_node',
      nodeId: node.id,
      position: { x: node.position.x + 1, y: node.position.y - 0.5 },
    };

    const humanResult = humanBus.execute(
      command,
      semanticEnvelope(humanBus, observed, command, 'human-node-move'),
      human,
    );
    const agentObserved = agentBus.inspect('buyer').workspace;
    const agentResult = agentBus.execute(
      command,
      semanticEnvelope(agentBus, agentObserved, command, 'agent-node-move'),
      agent,
    );

    expect(humanResult.receipt.afterHash).toBe(agentResult.receipt.afterHash);
    expect(humanResult.receipt.specHashAfter).toBe(agentResult.receipt.specHashAfter);
    expect(humanResult.receipt.command).toBe('move_node');
    expect(humanBus.receipts()).toHaveLength(1);
    expect(humanResult.workspace.sketchDocument.source).toEqual(
      expect.objectContaining({
        status: 'modified',
        modifiedNodeIds: expect.arrayContaining([node.id]),
      }),
    );
    expect(
      humanResult.workspace.sketchDocument.nodes.find(({ id }) => id === node.id)?.sourceRefs,
    ).toEqual(node.sourceRefs);
  });

  it('keeps create, transform, and constrain after-states identical across human and WebMCP paths', () => {
    const humanBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const agentBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const rectangle = rectangleCreation(
      'rectangle:equivalence',
      { x: 300, y: 10 },
      { x: 400, y: 90 },
    );
    const create: AttuneCommand = {
      type: 'create_geometry',
      entities: [
        ...rectangle.entities,
        { id: 'circle:equivalence', kind: 'circle', center: { x: 350, y: 50 }, radius: 20 },
      ],
      constraints: rectangle.constraints,
      group: rectangle.group,
    };
    const transform: AttuneCommand = {
      type: 'transform_geometry',
      entityIds: ['circle:equivalence'],
      pivot: { x: 350, y: 50 },
      translation: { x: 5, y: -2 },
      scale: 1.2,
    };
    const constrain: AttuneCommand = {
      type: 'apply_constraint',
      constraints: [
        {
          id: 'constraint:circle:fixed',
          type: 'fixed',
          refs: [{ entityId: 'circle:equivalence' }],
        },
      ],
    };

    for (const [index, command] of [create, transform, constrain].entries()) {
      const humanObserved = humanBus.inspect('buyer').workspace;
      const agentObserved = agentBus.inspect('buyer').workspace;
      const humanResult = humanBus.execute(
        command,
        semanticEnvelope(humanBus, humanObserved, command, `human-editor-${index}`),
        human,
      );
      const agentResult = agentBus.execute(
        command,
        semanticEnvelope(agentBus, agentObserved, command, `agent-editor-${index}`),
        agent,
      );
      expect(humanResult.receipt.afterHash).toBe(agentResult.receipt.afterHash);
      expect(humanResult.receipt.specHashAfter).toBe(agentResult.receipt.specHashAfter);
    }
  });
});

describe('footprint-aware semantic concurrency', () => {
  it('safely rebases disjoint human and agent edits after workspace sequence advances', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = bus.inspect('buyer').workspace;
    const agentCommand = editCircle(observed, 0, 106);
    const staleAgentEnvelope = semanticEnvelope(bus, observed, agentCommand, 'agent-disjoint');
    const humanCommand = editCircle(observed, 1, 23);
    bus.execute(
      humanCommand,
      semanticEnvelope(bus, observed, humanCommand, 'human-disjoint'),
      human,
    );

    const result = bus.execute(agentCommand, staleAgentEnvelope, agent);
    const entities = new Map(
      result.workspace.sketchDocument.entities.map((entity) => [entity.id, entity]),
    );
    expect(result.receipt.rebasedFromWorkspaceSeq).toBe(0);
    expect(entities.get(agentCommand.entities[0].id)).toEqual(
      expect.objectContaining({ radius: 106 }),
    );
    expect(entities.get(humanCommand.entities[0].id)).toEqual(
      expect.objectContaining({ radius: 23 }),
    );
  });

  it('rejects an overlapping entity edit with the exact changed semantic reference', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = bus.inspect('buyer').workspace;
    const agentCommand = editCircle(observed, 0, 111);
    const staleAgentEnvelope = semanticEnvelope(bus, observed, agentCommand, 'agent-overlap');
    const humanCommand = editCircle(observed, 0, 110);
    bus.execute(
      humanCommand,
      semanticEnvelope(bus, observed, humanCommand, 'human-overlap'),
      human,
    );

    expect(() => bus.execute(agentCommand, staleAgentEnvelope, agent)).toThrowError(
      expect.objectContaining({
        code: 'REVALIDATION_REQUIRED',
        changedEntities: [agentCommand.entities[0].id],
      }),
    );
  });

  it('surfaces the human intervention on the next agent observation', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = bus.inspect('buyer').workspace;
    const command = editCircle(observed, 1, 22);
    bus.execute(command, semanticEnvelope(bus, observed, command, 'human-observed'), human);

    expect(bus.inspect('buyer', 0).observation.interventions).toEqual([
      expect.objectContaining({
        origin: 'human_ui',
        command: 'edit_geometry',
        affectedEntities: expect.arrayContaining([command.entities[0].id]),
      }),
    ]);
  });
});

describe('semantic delegation authorization', () => {
  it('denies a delegation that does not include edit authority', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = bus.inspect('buyer').workspace;
    const command = editCircle(observed, 1, 22);
    const restricted: TrustedExecutionContext = {
      ...agent,
      delegation: delegation(['compare_valid_changes']),
    };

    expect(() =>
      bus.execute(
        command,
        semanticEnvelope(bus, observed, command, 'restricted-semantic'),
        restricted,
      ),
    ).toThrowError(expect.objectContaining({ code: 'DELEGATION_CAPABILITY_DENIED' }));
  });
});
