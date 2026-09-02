import { attuneUsersByIds } from '@attune/database';

import { currentAttuneUser } from '../../../lib/auth/session';
import { liveblocksRoomPermission } from '../../../lib/liveblocks/server';

export const dynamic = 'force-dynamic';

function requestBody(
  value: unknown,
): { readonly roomId?: string; readonly userIds: readonly string[] } | null {
  if (typeof value !== 'object' || value === null) return null;
  const roomId = Reflect.get(value, 'roomId');
  const userIds = Reflect.get(value, 'userIds');
  if (
    (roomId !== undefined &&
      (typeof roomId !== 'string' || !roomId.startsWith('attune:workspace:'))) ||
    !Array.isArray(userIds) ||
    userIds.some((id) => typeof id !== 'string')
  ) {
    return null;
  }
  return { ...(typeof roomId === 'string' ? { roomId } : {}), userIds: userIds.slice(0, 50) };
}

export async function POST(request: Request) {
  const body = requestBody(await request.json().catch(() => null));
  const user = await currentAttuneUser();
  if (!body) return new Response('Invalid request', { status: 400 });
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (body.roomId) {
    const permission = await liveblocksRoomPermission(body.roomId, user.userId);
    if (!permission.read) return new Response('Forbidden', { status: 403 });
  }

  const resolved = await attuneUsersByIds(body.userIds);
  const byId = new Map(resolved.map((entry) => [entry.id, entry]));
  return Response.json({
    users: body.userIds.map((id) => {
      const entry = byId.get(id);
      return entry ? { name: entry.name, role: 'buyer', color: '#376f68' } : null;
    }),
  });
}
