import { randomUUID } from 'node:crypto';

import {
  canCreateProjectsForUser,
  createSketchProjectRecord,
  databaseConfigured,
  ensureJudgeWorkspace,
} from '@attune/database';
import * as Y from 'yjs';

import { currentAttuneUser } from '../../../lib/auth/session';
import { getLiveblocks, liveblocksConfigured } from '../../../lib/liveblocks/server';
import {
  createSketchProjectPlan,
  provisionSketchProject,
} from '../../../lib/projects/create-project';
import type { SketchTemplate } from '../../../lib/projects/library';
import { SPOKE_SKETCH } from '../../../lib/sketch/spoke-sketch';

function noStoreJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

function requestedTemplate(value: unknown): SketchTemplate | null {
  if (typeof value !== 'object' || value === null) return null;
  const template = Reflect.get(value, 'template');
  return template === 'blank' || template === 'spoke' ? template : null;
}

function sketchDocumentUpdate(template: SketchTemplate, name: string): Uint8Array {
  const document = new Y.Doc();
  try {
    document.getMap('attune').set('sketch', {
      version: 1,
      name,
      template,
      entities: template === 'spoke' ? structuredClone(SPOKE_SKETCH.entities) : [],
    });
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!databaseConfigured() || !liveblocksConfigured()) {
    return noStoreJson({ error: 'Project creation is not configured.' }, 503);
  }
  const user = await currentAttuneUser();
  if (!user) return noStoreJson({ error: 'Authentication required.' }, 401);
  if (user.judge) await ensureJudgeWorkspace();
  if (!(await canCreateProjectsForUser(user.userId))) {
    return noStoreJson({ error: 'Project creation is not permitted.' }, 403);
  }

  const template = requestedTemplate(await request.json().catch(() => null));
  if (!template) return noStoreJson({ error: 'Choose a supported sketch template.' }, 400);

  const plan = createSketchProjectPlan(template, randomUUID);
  const liveblocks = getLiveblocks();
  const update = sketchDocumentUpdate(plan.template, plan.name);

  try {
    await provisionSketchProject(
      {
        createRoom: async ({ roomId, workspaceId, projectId, name }) => {
          await liveblocks.createRoom(
            roomId,
            {
              defaultAccesses: [],
              usersAccesses: { [user.userId]: ['room:write'] },
              metadata: { workspaceId, projectId, name, kind: 'precision-sketch' },
            },
            { idempotent: true },
          );
        },
        initializeDocument: async ({ roomId }) => {
          await liveblocks.sendYjsBinaryUpdate(roomId, update);
        },
        persistProject: async (created) => {
          await createSketchProjectRecord({ userId: user.userId, ...created });
        },
        deleteRoom: async (roomId) => {
          await liveblocks.deleteRoom(roomId);
        },
      },
      plan,
    );
    return noStoreJson({ workspaceId: plan.workspaceId }, 201);
  } catch {
    return noStoreJson({ error: 'The project could not be created.' }, 500);
  }
}
