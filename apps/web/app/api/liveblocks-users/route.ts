import { identityForLiveblocksRoom, usersForLiveblocksRoom } from '@attune/database';

import { currentAttuneUser } from '../../../lib/auth/session';

export const dynamic = 'force-dynamic';

function requestBody(
  value: unknown,
): { readonly roomId: string; readonly userIds: readonly string[] } | null {
  if (typeof value !== 'object' || value === null) return null;
  const roomId = Reflect.get(value, 'roomId');
  const userIds = Reflect.get(value, 'userIds');
  if (
    typeof roomId !== 'string' ||
    !roomId.startsWith('attune:workspace:') ||
    !Array.isArray(userIds) ||
    userIds.some((id) => typeof id !== 'string')
  ) {
    return null;
  }
  return { roomId, userIds: userIds.slice(0, 50) };
}

export async function POST(request: Request) {
  const body = requestBody(await request.json());
  const user = await currentAttuneUser();
  if (!body || !user) return new Response('Unauthorized', { status: 401 });
  const identity = await identityForLiveblocksRoom(body.roomId, user.userId, user.principalId);
  if (!identity) return new Response('Forbidden', { status: 403 });

  const resolved = await usersForLiveblocksRoom(body.roomId, body.userIds);
  const byId = new Map(resolved.map((entry) => [entry.id, entry]));
  return Response.json({
    users: body.userIds.map((id) => {
      const entry = byId.get(id);
      return entry ? { name: entry.name, role: 'buyer', color: '#376f68' } : null;
    }),
  });
}
