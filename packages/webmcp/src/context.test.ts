import { createAt1042Workspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { compileAgentContext } from './context';

describe('compact AgentContextSnapshot', () => {
  it('returns focused semantic references and unseen human changes without workspace records', () => {
    const workspace = createAt1042Workspace();
    const entity = workspace.sketchDocument.entities.find(
      (candidate) => candidate.kind === 'line',
    )!;
    const group = workspace.sketchDocument.groups.find((candidate) =>
      candidate.entityIds.includes(entity.id),
    )!;
    const context = compileAgentContext({
      workspace,
      role: 'buyer',
      capabilityIds: ['edit_draft'],
      focus: { entityIds: [entity.id] },
      observation: {
        previousWorkspaceSeq: 0,
        currentWorkspaceSeq: 1,
        interventions: [
          {
            receiptSeq: 1,
            origin: 'human_ui',
            command: 'edit_geometry',
            affectedEntities: [entity.id],
            beforeHash: 'before',
            afterHash: 'after',
          },
        ],
      },
    });

    expect(context.geometry.map(({ id }) => id)).toEqual([entity.id]);
    expect(context.nodes.map(({ id }) => id).toSorted()).toEqual(
      [entity.startNodeId, entity.endNodeId].toSorted((left, right) =>
        (left ?? '').localeCompare(right ?? ''),
      ),
    );
    expect(context.groups.map(({ id }) => id)).toEqual([group.id]);
    expect(context.unseenChanges).toEqual([
      {
        sequence: 1,
        origin: 'human_ui',
        command: 'edit_geometry',
        semanticRefs: [entity.id],
      },
    ]);
    expect(context.availableActions).toEqual(
      expect.arrayContaining(['modify_geometry', 'constrain_geometry']),
    );
    expect(context).not.toHaveProperty('receipts');
    expect(context).not.toHaveProperty('commerceLinks');
    expect(context).not.toHaveProperty('providerCapabilityProfile');
  });
});
