import {
  attuneUserForSharing,
  attuneUsersByIds,
  bumpWorkspaceAuthorityEpochForRoom,
} from '@attune/database';

import { currentAttuneUser } from '../../../lib/auth/session';
import {
  effectiveRoomPermissions,
  roomPermissionsAllow,
  roomPermissionsForShareRole,
  shareRoleForRoomPermissions,
  type AttuneShareRole,
} from '../../../lib/liveblocks/access';
import { attuneActivityNotification } from '../../../lib/liveblocks/notifications';
import {
  getLiveblocks,
  liveblocksConfigured,
  syncAuthoritativeWorkspace,
} from '../../../lib/liveblocks/server';

export const dynamic = 'force-dynamic';

function roomIdFrom(value: string | null): string | null {
  return value?.startsWith('attune:workspace:') ? value : null;
}

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

function shareRequest(value: unknown): {
  readonly roomId: string;
  readonly identifier: string;
  readonly role: AttuneShareRole | null;
} | null {
  if (typeof value !== 'object' || value === null) return null;
  const roomId = roomIdFrom(String(Reflect.get(value, 'roomId') ?? ''));
  const identifier = Reflect.get(value, 'identifier');
  const role = Reflect.get(value, 'role');
  if (
    !roomId ||
    typeof identifier !== 'string' ||
    identifier.length < 3 ||
    identifier.length > 320 ||
    (role !== null && role !== 'viewer' && role !== 'commenter' && role !== 'editor')
  ) {
    return null;
  }
  return { roomId, identifier: identifier.trim(), role };
}

async function editableRoom(roomId: string, userId: string) {
  const room = await getLiveblocks().getRoom(roomId);
  const permissions = effectiveRoomPermissions(room, userId);
  return roomPermissionsAllow(permissions, 'write') ? room : null;
}

export async function GET(request: Request) {
  if (!liveblocksConfigured()) return noStoreJson({ error: 'Sharing is unavailable.' }, 503);
  const roomId = roomIdFrom(new URL(request.url).searchParams.get('room_id'));
  const user = await currentAttuneUser();
  if (!roomId || !user) return noStoreJson({ error: 'Authentication required.' }, 401);
  const room = await editableRoom(roomId, user.userId);
  if (!room) return noStoreJson({ error: 'Editor access is required.' }, 403);
  const userIds = Object.keys(room.usersAccesses);
  const identities = await attuneUsersByIds(userIds);
  const names = new Map(identities.map((identity) => [identity.id, identity.name]));
  return noStoreJson({
    defaultAccess: shareRoleForRoomPermissions(room.defaultAccesses),
    groupsAccesses: room.groupsAccesses,
    users: userIds.map((id) => ({
      id,
      name: names.get(id) ?? id,
      role: shareRoleForRoomPermissions(room.usersAccesses[id] ?? []),
      currentUser: id === user.userId,
    })),
  });
}

export async function PATCH(request: Request) {
  if (!liveblocksConfigured()) return noStoreJson({ error: 'Sharing is unavailable.' }, 503);
  const input = shareRequest(await request.json().catch(() => null));
  const user = await currentAttuneUser();
  if (!input || !user) return noStoreJson({ error: 'Invalid sharing request.' }, 400);
  const room = await editableRoom(input.roomId, user.userId);
  if (!room) return noStoreJson({ error: 'Editor access is required.' }, 403);
  const target = await attuneUserForSharing(input.identifier);
  if (!target)
    return noStoreJson({ error: 'No Attune account matches that email or user ID.' }, 404);
  if (target.id === user.userId && input.role !== 'editor') {
    return noStoreJson({ error: 'You cannot remove your own editor access.' }, 409);
  }
  const previousRole = shareRoleForRoomPermissions(room.usersAccesses[target.id] ?? []);
  await getLiveblocks().updateRoom(input.roomId, {
    usersAccesses: {
      [target.id]: input.role ? [...roomPermissionsForShareRole(input.role)] : null,
    },
  });
  if ((previousRole === 'editor') !== (input.role === 'editor')) {
    const workspace = await bumpWorkspaceAuthorityEpochForRoom(input.roomId);
    await syncAuthoritativeWorkspace(input.roomId, workspace);
  }
  if (input.role && target.id !== user.userId) {
    await getLiveblocks().triggerInboxNotification(
      attuneActivityNotification({
        userId: target.id,
        roomId: input.roomId,
        subjectId: `share:${input.roomId}`,
        title: 'Workspace shared with you',
        description: `${user.displayName} gave you ${input.role} access.`,
        workspaceId: String(room.metadata.workspaceId ?? ''),
        actorId: user.userId,
      }),
    );
  }
  return noStoreJson({
    updated: true,
    user: { id: target.id, name: target.name, role: input.role },
  });
}
