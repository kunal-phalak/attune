import {
  databaseConfigured,
  deleteSketchProjectRecord,
  ensureJudgeWorkspace,
  renameSketchProjectRecord,
} from '@attune/database';

import { currentAttuneUser } from '../../../../lib/auth/session';
import { getLiveblocks, liveblocksConfigured } from '../../../../lib/liveblocks/server';
import { deleteManagedProject } from '../../../../lib/projects/manage-project';

function noStoreJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

function statusFor(error: unknown): number {
  return error instanceof Error && error.message === 'PROJECT_MANAGE_FORBIDDEN' ? 403 : 500;
}

function requestedName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const name = Reflect.get(value, 'name');
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 80 ? trimmed : null;
}

async function currentManager(): Promise<Awaited<ReturnType<typeof currentAttuneUser>>> {
  const user = await currentAttuneUser();
  if (user?.judge) await ensureJudgeWorkspace();
  return user;
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly workspaceId: string }> },
): Promise<Response> {
  if (!databaseConfigured() || !liveblocksConfigured()) {
    return noStoreJson({ error: 'Project management is not configured.' }, 503);
  }
  const user = await currentManager();
  if (!user) return noStoreJson({ error: 'Authentication required.' }, 401);
  const name = requestedName(await request.json().catch(() => null));
  if (!name)
    return noStoreJson({ error: 'Enter a project name between 1 and 80 characters.' }, 400);
  const { workspaceId } = await context.params;
  try {
    const renamed = await renameSketchProjectRecord({ userId: user.userId, workspaceId, name });
    const liveblocks = getLiveblocks();
    await Promise.allSettled(
      renamed.roomIds.map((roomId) => liveblocks.updateRoom(roomId, { metadata: { name } })),
    );
    return noStoreJson({ workspaceId, projectName: name }, 200);
  } catch (error) {
    return noStoreJson({ error: 'The project could not be renamed.' }, statusFor(error));
  }
}

export async function DELETE(
  _request: Request,
  context: { readonly params: Promise<{ readonly workspaceId: string }> },
): Promise<Response> {
  if (!databaseConfigured() || !liveblocksConfigured()) {
    return noStoreJson({ error: 'Project management is not configured.' }, 503);
  }
  const user = await currentManager();
  if (!user) return noStoreJson({ error: 'Authentication required.' }, 401);
  const { workspaceId } = await context.params;
  try {
    const liveblocks = getLiveblocks();
    await deleteManagedProject(
      {
        persistAuthorizedDeletion: (input) => deleteSketchProjectRecord(input),
        deleteRoom: (roomId) => liveblocks.deleteRoom(roomId),
      },
      { userId: user.userId, workspaceId },
    );
    return noStoreJson({ workspaceId, deleted: true }, 200);
  } catch (error) {
    return noStoreJson({ error: 'The project could not be deleted.' }, statusFor(error));
  }
}
