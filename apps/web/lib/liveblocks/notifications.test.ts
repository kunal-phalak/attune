import { describe, expect, it } from 'vitest';

import { attuneActivityNotification } from './notifications';

describe('Attune custom collaboration notifications', () => {
  it('creates the Liveblocks activity payload consumed by the common inbox', () => {
    expect(
      attuneActivityNotification({
        userId: 'user:provider',
        roomId: 'attune:workspace:shared',
        workspaceId: 'workspace:shared',
        subjectId: 'share:attune:workspace:shared',
        title: 'Workspace shared with you',
        description: 'Kunal gave you commenter access.',
        actorId: 'user:kunal',
      }),
    ).toEqual({
      userId: 'user:provider',
      roomId: 'attune:workspace:shared',
      kind: '$attuneActivity',
      subjectId: 'share:attune:workspace:shared',
      activityData: {
        title: 'Workspace shared with you',
        description: 'Kunal gave you commenter access.',
        workspaceId: 'workspace:shared',
        actorId: 'user:kunal',
      },
    });
  });
});
