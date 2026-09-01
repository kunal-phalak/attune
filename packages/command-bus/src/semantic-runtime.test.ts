import {
  createAt1042Workspace,
  hashCanonical,
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

function editCircle(entityId: string, radius: number): AttuneCommand {
  return {
    type: 'edit_geometry',
    entities: [{ id: entityId, kind: 'circle', center: { x: 0, y: 0 }, radius }],
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
    const command = editCircle('sketch:rim:outer', 154);
    const humanObserved = humanBus.inspect('buyer').workspace;
    const agentObserved = agentBus.inspect('buyer').workspace;

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
    const command = editCircle('sketch:hub:bore', 18);
    const observed = bus.inspect('buyer').workspace;
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
});

describe('footprint-aware semantic concurrency', () => {
  it('safely rebases disjoint human and agent edits after workspace sequence advances', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = bus.inspect('buyer').workspace;
    const agentCommand = editCircle('sketch:rim:inner', 128);
    const staleAgentEnvelope = semanticEnvelope(bus, observed, agentCommand, 'agent-disjoint');
    const humanCommand = editCircle('sketch:hub:outer', 42);
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
    expect(entities.get('sketch:rim:inner')).toEqual(expect.objectContaining({ radius: 128 }));
    expect(entities.get('sketch:hub:outer')).toEqual(expect.objectContaining({ radius: 42 }));
  });

  it('rejects an overlapping entity edit with the exact changed semantic reference', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = bus.inspect('buyer').workspace;
    const agentCommand = editCircle('sketch:rim:outer', 152);
    const staleAgentEnvelope = semanticEnvelope(bus, observed, agentCommand, 'agent-overlap');
    const humanCommand = editCircle('sketch:rim:outer', 151);
    bus.execute(
      humanCommand,
      semanticEnvelope(bus, observed, humanCommand, 'human-overlap'),
      human,
    );

    expect(() => bus.execute(agentCommand, staleAgentEnvelope, agent)).toThrowError(
      expect.objectContaining({
        code: 'REVALIDATION_REQUIRED',
        changedEntities: ['sketch:rim:outer'],
      }),
    );
  });

  it('surfaces the human intervention on the next agent observation', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const observed = bus.inspect('buyer').workspace;
    const command = editCircle('sketch:hub:bore', 17);
    bus.execute(command, semanticEnvelope(bus, observed, command, 'human-observed'), human);

    expect(bus.inspect('buyer', 0).observation.interventions).toEqual([
      expect.objectContaining({
        origin: 'human_ui',
        command: 'edit_geometry',
        affectedEntities: expect.arrayContaining(['sketch:hub:bore']),
      }),
    ]);
  });
});

describe('semantic delegation authorization', () => {
  it('denies a delegation that does not include edit authority', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME, solver);
    const command = editCircle('sketch:hub:bore', 17);
    const observed = bus.inspect('buyer').workspace;
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
