import { identityForLiveblocksRoom } from '@attune/database';

import { currentAttuneUser } from '../../../lib/auth/session';
import { getLiveblocks, liveblocksConfigured } from '../../../lib/liveblocks/server';

export const dynamic = 'force-dynamic';

function versionRequest(
  value: unknown,
): { readonly roomId: string; readonly workspaceId: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const roomId = Reflect.get(value, 'roomId');
  const workspaceId = Reflect.get(value, 'workspaceId');
  return typeof roomId === 'string' &&
    roomId.startsWith('attune:workspace:') &&
    typeof workspaceId === 'string' &&
    workspaceId.startsWith('workspace:')
    ? { roomId, workspaceId }
    : null;
}

function noStoreJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!liveblocksConfigured())
    return noStoreJson({ error: 'Version history is unavailable.' }, 503);
  const input = versionRequest(await request.json().catch(() => null));
  const user = await currentAttuneUser();
  if (!input || !user) return noStoreJson({ error: 'Authentication required.' }, 401);
  const identity = await identityForLiveblocksRoom(input.roomId, user.userId, user.principalId);
  if (!identity || identity.workspaceId !== input.workspaceId) {
    return noStoreJson({ error: 'Workspace access is required.' }, 403);
  }
  try {
    await getLiveblocks().createVersionHistorySnapshot(input.roomId);
    return noStoreJson({ saved: true }, 201);
  } catch {
    return noStoreJson({ error: 'The version could not be saved.' }, 502);
  }
}
