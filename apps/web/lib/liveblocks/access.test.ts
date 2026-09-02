import { describe, expect, it } from 'vitest';

import {
  effectiveRoomPermissions,
  roomPermissionsAllow,
  roomPermissionsForShareRole,
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
});
