import { createAt1042Workspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { compileAgentContext } from './context';

describe('compact AgentContextSnapshot', () => {
  it('returns focused semantic references and unseen human changes without workspace records', () => {
    const workspace = createAt1042Workspace();
    const context = compileAgentContext({
      workspace,
      role: 'buyer',
      capabilityIds: ['edit_draft'],
      focus: { entityIds: ['sketch:hub:bore'] },
      observation: {
        previousWorkspaceSeq: 0,
        currentWorkspaceSeq: 1,
        interventions: [
          {
            receiptSeq: 1,
            origin: 'human_ui',
            command: 'edit_geometry',
            affectedEntities: ['sketch:hub:bore'],
            beforeHash: 'before',
            afterHash: 'after',
          },
        ],
      },
    });

    expect(context.geometry.map(({ id }) => id)).toEqual(['sketch:hub:bore']);
    expect(context.groups.map(({ id }) => id)).toEqual(['group:hub']);
    expect(context.unseenChanges).toEqual([
      {
        sequence: 1,
        origin: 'human_ui',
        command: 'edit_geometry',
        semanticRefs: ['sketch:hub:bore'],
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
