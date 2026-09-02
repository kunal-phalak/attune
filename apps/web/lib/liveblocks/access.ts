export type AttuneShareRole = 'viewer' | 'commenter' | 'editor';

export function roomPermissionsForShareRole(
  role: AttuneShareRole,
): readonly ('*:read' | '*:write' | 'comments:none' | 'comments:write')[] {
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
