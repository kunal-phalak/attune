import { createAt1042Workspace, hashSpecification } from '@attune/domain';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  authoritativeDraftUpdate,
  agentPresencePayload,
  collaborativeDraftFromUpdate,
} from './server';

function nextWorkspace(actor: 'human' | 'agent') {
  const workspace = createAt1042Workspace();
  return {
    ...workspace,
    workspaceSeq: 1,
    draftVersion: workspace.draftVersion + 1,
    sketchDocument: {
      ...workspace.sketchDocument,
      revision: workspace.sketchDocument.revision + 1,
      name: `${actor} realtime authoritative sketch`,
    },
  };
}

describe('authoritative Liveblocks Yjs commit bridge', () => {
  it.each(['human', 'agent'] as const)(
    'publishes one %s semantic transaction that converges two connected clients',
    (actor) => {
      const initial = createAt1042Workspace();
      const firstUpdate = authoritativeDraftUpdate(null, initial);
      const tabA = new Y.Doc();
      const tabB = new Y.Doc();
      Y.applyUpdate(tabA, firstUpdate);
      Y.applyUpdate(tabB, firstUpdate);

      let observedTransactions = 0;
      tabB.getMap('attune').observe(() => {
        observedTransactions += 1;
      });
      const next = nextWorkspace(actor);
      const serverState = Y.encodeStateAsUpdate(tabA);
      const semanticCommit = authoritativeDraftUpdate(serverState, next);
      Y.applyUpdate(tabA, semanticCommit);
      Y.applyUpdate(tabB, semanticCommit);

      expect(observedTransactions).toBe(1);
      expect(tabA.getMap('attune').get('draft')).toEqual(tabB.getMap('attune').get('draft'));
      expect(collaborativeDraftFromUpdate(Y.encodeStateAsUpdate(tabB))).toEqual(
        expect.objectContaining({
          workspaceSeq: 1,
          specHash: hashSpecification(next),
          sketchDocument: expect.objectContaining({
            name: `${actor} realtime authoritative sketch`,
          }),
        }),
      );
      expect(tabB.getMap('attune').get('draft')).not.toHaveProperty('cursor');
      expect(tabB.getMap('attune').get('draft')).not.toHaveProperty('selectedEntityIds');

      tabA.destroy();
      tabB.destroy();
    },
  );

  it('keeps agent presence ephemeral and carries only real semantic focus', () => {
    expect(
      agentPresencePayload(
        'Applying a constraint',
        { entityIds: ['line:a'], constraintIds: ['constraint:tangent:a'] },
        2,
      ),
    ).toEqual({
      userId: 'attune-agent',
      userInfo: { name: 'Attune Agent', color: '#7c5ce7' },
      data: {
        cursor: null,
        selectedEntityIds: ['line:a'],
        selectedNodeIds: [],
        selectedConstraintIds: ['constraint:tangent:a'],
        activeTool: 'agent',
        activity: 'Applying a constraint',
      },
      ttl: 2,
    });
  });
});
