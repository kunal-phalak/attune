import { currentAttuneUser } from '../../../lib/auth/session';
import { getLiveblocks, liveblocksRoomPermission } from '../../../lib/liveblocks/server';

export const dynamic = 'force-dynamic';

function roomFrom(value: unknown): string | null | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const room = Reflect.get(value, 'room');
  if (room === undefined) return undefined;
  return typeof room === 'string' && room.startsWith('attune:workspace:') ? room : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) return new Response('Invalid request', { status: 400 });
  const roomId = roomFrom(body);
  const user = await currentAttuneUser();
  if (roomId === null || !user) return new Response('Unauthorized', { status: 401 });
  if (roomId) {
    const permission = await liveblocksRoomPermission(roomId, user.userId);
    if (!permission.read) return new Response('Forbidden', { status: 403 });
  }

  const authorization = await getLiveblocks().identifyUser(user.userId, {
    userInfo: {
      name: user.displayName,
      role: 'buyer',
      color: user.judge ? '#ff6b3d' : '#236b5b',
    },
  });
  return new Response(authorization.body, { status: authorization.status });
}
