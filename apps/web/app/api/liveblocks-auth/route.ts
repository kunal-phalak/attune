import { identityForLiveblocksRoom } from '@attune/database';

import { currentAttuneUser } from '../../../lib/auth/session';
import { getLiveblocks } from '../../../lib/liveblocks/server';

export const dynamic = 'force-dynamic';

function roomFrom(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const room = Reflect.get(value, 'room');
  return typeof room === 'string' && room.startsWith('attune:workspace:') ? room : null;
}

export async function POST(request: Request) {
  const roomId = roomFrom(await request.json());
  const user = await currentAttuneUser();
  if (!roomId || !user) return new Response('Unauthorized', { status: 401 });
  const identity = await identityForLiveblocksRoom(roomId, user.userId, user.principalId);
  if (!identity) return new Response('Forbidden', { status: 403 });

  const session = getLiveblocks().prepareSession(user.userId, {
    userInfo: {
      name: identity.displayName,
      role: identity.roles[0] ?? 'buyer',
      color: user.judge ? '#ff6b3d' : '#236b5b',
    },
  });
  session.allow(roomId, ['*:write']);
  const authorization = await session.authorize();
  return new Response(authorization.body, { status: authorization.status });
}
