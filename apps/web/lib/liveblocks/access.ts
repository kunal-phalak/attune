export type AttuneShareRole = 'viewer' | 'commenter' | 'editor';
export const ATTUNE_ROOM_ACCESS_MODEL = 'liveblocks-room-acl-v1';

type AttuneRoomPermission = '*:read' | '*:write' | 'comments:none' | 'comments:write';

interface WorkspaceRoomMember {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly canComment: boolean;
}

export function roomPermissionsForWorkspaceMember(member: {
  readonly roles: readonly string[];
  readonly canComment: boolean;
}): readonly AttuneRoomPermission[] {
  if (member.roles.includes('buyer') || member.roles.includes('provider')) return ['*:write'];
  return member.canComment ? ['*:read', 'comments:write'] : ['*:read', 'comments:none'];
}

export function legacyWorkspaceAccessMigration(
  room: {
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly usersAccesses: Readonly<Record<string, readonly string[]>>;
  },
  members: readonly WorkspaceRoomMember[],
): { readonly usersAccesses: Record<string, AttuneRoomPermission[]> } | null {
  if (room.metadata.attuneAccessModel === ATTUNE_ROOM_ACCESS_MODEL || members.length === 0) {
    return null;
  }
  return {
    usersAccesses: Object.fromEntries(
      members
        .filter((member) => !Object.hasOwn(room.usersAccesses, member.userId))
        .map((member) => [member.userId, [...roomPermissionsForWorkspaceMember(member)]]),
    ),
  };
}

export function roomPermissionsForShareRole(
  role: AttuneShareRole,
): readonly AttuneRoomPermission[] {
  if (role === 'editor') return ['*:write'];
  if (role === 'commenter') return ['*:read', 'comments:write'];
  return ['*:read', 'comments:none'];
}

export function shareRoleForRoomPermissions(
  permissions: readonly string[],
): AttuneShareRole | null {
  if (permissions.includes('*:write') || permissions.includes('room:write')) return 'editor';
  if (permissions.includes('comments:write')) return 'commenter';
  if (permissions.includes('*:read') || permissions.includes('room:read')) return 'viewer';
  return null;
}

export function effectiveRoomPermissions(
  room: {
    readonly defaultAccesses: readonly string[];
    readonly usersAccesses: Readonly<Record<string, readonly string[]>>;
  },
  userId: string,
): readonly string[] {
  return room.usersAccesses[userId] ?? room.defaultAccesses;
}

export function roomPermissionsAllow(
  permissions: readonly string[],
  resource: 'read' | 'write' | 'comment',
): boolean {
  if (resource === 'write') {
    return permissions.includes('*:write') || permissions.includes('room:write');
  }
  if (resource === 'comment') {
    return roomPermissionsAllow(permissions, 'write') || permissions.includes('comments:write');
  }
  return (
    roomPermissionsAllow(permissions, 'write') ||
    permissions.includes('*:read') ||
    permissions.includes('room:read')
  );
}
