import { currentAttuneUser } from '../../../lib/auth/session';
import { getLiveblocks, liveblocksRoomPermission } from '../../../lib/liveblocks/server';
import { measureServerPhase, ServerTimingTrace } from '../../../lib/server-timing';

export const dynamic = 'force-dynamic';

function roomFrom(value: unknown): string | null | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const room = Reflect.get(value, 'room');
  if (room === undefined) return undefined;
  return typeof room === 'string' && room.startsWith('attune:workspace:') ? room : null;
}

export async function POST(request: Request) {
  const timing = new ServerTimingTrace();
  const startedAt = performance.now();
  const body = await request.json().catch(() => null);
  if (body === null) return timing.apply(new Response('Invalid request', { status: 400 }));
  const roomId = roomFrom(body);
  const user = await measureServerPhase(timing.record, 'session_resolve', currentAttuneUser);
  if (roomId === null || !user) {
    timing.record('total', performance.now() - startedAt);
    return timing.apply(new Response('Unauthorized', { status: 401 }));
  }
  if (roomId) {
    const permission = await measureServerPhase(timing.record, 'membership_acl_resolve', () =>
      liveblocksRoomPermission(roomId, user.userId),
    );
    if (!permission.read) {
      timing.record('total', performance.now() - startedAt);
      return timing.apply(new Response('Forbidden', { status: 403 }));
    }
  }

  const authorization = await measureServerPhase(timing.record, 'liveblocks_token', () =>
    getLiveblocks().identifyUser(user.userId, {
      userInfo: {
        name: user.displayName,
        role: 'buyer',
        color: user.judge ? '#ff6b3d' : '#236b5b',
      },
    }),
  );
  timing.record('total', performance.now() - startedAt);
  return timing.apply(new Response(authorization.body, { status: authorization.status }));
}
