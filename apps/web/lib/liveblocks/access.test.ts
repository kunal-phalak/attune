import { describe, expect, it } from 'vitest';

import {
  ATTUNE_ROOM_ACCESS_MODEL,
  effectiveRoomPermissions,
  legacyWorkspaceAccessMigration,
  roomPermissionsAllow,
  roomPermissionsForShareRole,
  roomPermissionsForWorkspaceMember,
  shareRoleForRoomPermissions,
} from './access';

describe('Liveblocks room access roles', () => {
  it.each([
    ['viewer', ['*:read', 'comments:none']],
    ['commenter', ['*:read', 'comments:write']],
    ['editor', ['*:write']],
  ] as const)('maps %s to room permission truth', (role, permissions) => {
    expect(roomPermissionsForShareRole(role)).toEqual(permissions);
    expect(shareRoleForRoomPermissions(permissions)).toBe(role);
  });

  it('uses direct user access over the room default and distinguishes comments from edits', () => {
    const permissions = effectiveRoomPermissions(
      {
        defaultAccesses: ['*:read'],
        usersAccesses: { 'user:commenter': ['*:read', 'comments:write'] },
      },
      'user:commenter',
    );
    expect(roomPermissionsAllow(permissions, 'read')).toBe(true);
    expect(roomPermissionsAllow(permissions, 'comment')).toBe(true);
    expect(roomPermissionsAllow(permissions, 'write')).toBe(false);
  });

  it('maps legacy workspace membership into the initial room ACL without conflating roles', () => {
    expect(
      roomPermissionsForWorkspaceMember({ roles: ['buyer', 'provider'], canComment: true }),
    ).toEqual(['*:write']);
    expect(roomPermissionsForWorkspaceMember({ roles: ['reviewer'], canComment: true })).toEqual([
      '*:read',
      'comments:write',
    ]);
    expect(roomPermissionsForWorkspaceMember({ roles: ['reviewer'], canComment: false })).toEqual([
      '*:read',
      'comments:none',
    ]);
  });

  it('migrates missing legacy members once and preserves explicit room access', () => {
    const migration = legacyWorkspaceAccessMigration(
      {
        metadata: {},
        usersAccesses: { 'user:viewer': ['*:read', 'comments:none'] },
      },
      [
        { userId: 'user:owner', roles: ['buyer'], canComment: true },
        { userId: 'user:viewer', roles: ['provider'], canComment: true },
      ],
    );
    expect(migration).toEqual({ usersAccesses: { 'user:owner': ['*:write'] } });
    expect(
      legacyWorkspaceAccessMigration(
        { metadata: { attuneAccessModel: ATTUNE_ROOM_ACCESS_MODEL }, usersAccesses: {} },
        [{ userId: 'user:owner', roles: ['buyer'], canComment: true }],
      ),
    ).toBeNull();
  });
});
