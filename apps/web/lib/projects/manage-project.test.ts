import { describe, expect, it, vi } from 'vitest';

import { deleteManagedProject } from './manage-project';

const deletedProject = {
  projectId: 'project:disposable',
  workspaceIds: ['workspace:disposable'],
  roomIds: ['attune:workspace:disposable'],
};

describe('project deletion', () => {
  it('does not touch Liveblocks when server authorization or persistence fails', async () => {
    const deleteRoom = vi.fn(async () => undefined);
    await expect(
      deleteManagedProject(
        {
          persistAuthorizedDeletion: vi.fn(async () => {
            throw new Error('PROJECT_MANAGE_FORBIDDEN');
          }),
          deleteRoom,
        },
        { userId: 'user:shared', workspaceId: 'workspace:disposable' },
      ),
    ).rejects.toThrow('PROJECT_MANAGE_FORBIDDEN');
    expect(deleteRoom).not.toHaveBeenCalled();
  });

  it('persists the deletion before cleaning up its Liveblocks rooms', async () => {
    const order: string[] = [];
    const result = await deleteManagedProject(
      {
        persistAuthorizedDeletion: vi.fn(async () => {
          order.push('database');
          return deletedProject;
        }),
        deleteRoom: vi.fn(async () => void order.push('room')),
      },
      { userId: 'user:owner', workspaceId: 'workspace:disposable' },
    );
    expect(order).toEqual(['database', 'room']);
    expect(result.roomCleanupFailures).toBe(0);
  });

  it('keeps the persisted result when remote room cleanup fails', async () => {
    await expect(
      deleteManagedProject(
        {
          persistAuthorizedDeletion: vi.fn(async () => deletedProject),
          deleteRoom: vi.fn(async () => {
            throw new Error('remote unavailable');
          }),
        },
        { userId: 'user:owner', workspaceId: 'workspace:disposable' },
      ),
    ).resolves.toMatchObject({ projectId: 'project:disposable', roomCleanupFailures: 1 });
  });
});
