import { workspaceMembersForLiveblocksRoom } from '@attune/database';
import { hashSpecification, type AttuneWorkspace } from '@attune/domain';
import { Liveblocks } from '@liveblocks/node';
import * as Y from 'yjs';

import { isAttuneCollaborativeDraft, type AttuneCollaborativeDraft } from '../../liveblocks.config';
import {
  ATTUNE_ROOM_ACCESS_MODEL,
  effectiveRoomPermissions,
  legacyWorkspaceAccessMigration,
  roomPermissionsAllow,
} from './access';

let liveblocks: Liveblocks | undefined;
const accessMigrationQueue = new Map<string, Promise<void>>();

export function liveblocksConfigured(): boolean {
  return Boolean(process.env.LIVEBLOCKS_SECRET_KEY);
}

export function getLiveblocks(): Liveblocks {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new Error('LIVEBLOCKS_SECRET_KEY is required for workspace collaboration.');
  liveblocks ??= new Liveblocks({ secret });
  return liveblocks;
}

export async function liveblocksRoomIdsForUser(userId: string): Promise<readonly string[]> {
  if (!liveblocksConfigured()) return [];
  const roomIds: string[] = [];
  for await (const room of getLiveblocks().iterRooms(
    {
      userId,
      query: { roomId: { startsWith: 'attune:workspace:' } },
    },
    { pageSize: 100 },
  )) {
    roomIds.push(room.id);
  }
  return roomIds;
}

async function migrateLegacyWorkspaceAccess(roomId: string): Promise<void> {
  const previous = accessMigrationQueue.get(roomId);
  if (previous) return previous;
  const migration = (async () => {
    const client = getLiveblocks();
    const room = await client.getRoom(roomId);
    if (room.metadata.attuneAccessModel === ATTUNE_ROOM_ACCESS_MODEL) return;
    const members = await workspaceMembersForLiveblocksRoom(roomId);
    const update = legacyWorkspaceAccessMigration(room, members);
    if (!update) return;
    await client.updateRoom(roomId, {
      usersAccesses: update.usersAccesses,
      metadata: { attuneAccessModel: ATTUNE_ROOM_ACCESS_MODEL },
    });
  })();
  accessMigrationQueue.set(roomId, migration);
  try {
    await migration;
  } finally {
    if (accessMigrationQueue.get(roomId) === migration) accessMigrationQueue.delete(roomId);
  }
}

export async function liveblocksRoomPermission(
  roomId: string,
  userId: string,
): Promise<{ readonly read: boolean; readonly comment: boolean; readonly write: boolean }> {
  if (!liveblocksConfigured()) return { read: false, comment: false, write: false };
  await migrateLegacyWorkspaceAccess(roomId);
  const room = await getLiveblocks().getRoom(roomId);
  const permissions = effectiveRoomPermissions(room, userId);
  return {
    read: roomPermissionsAllow(permissions, 'read'),
    comment: roomPermissionsAllow(permissions, 'comment'),
    write: roomPermissionsAllow(permissions, 'write'),
  };
}

export function collaborativeDraft(workspace: AttuneWorkspace): AttuneCollaborativeDraft {
  return {
    intent: 'Fabricate a custom control-enclosure faceplate with four protected buyer mounts.',
    commitmentId: workspace.commitmentId,
    fabricationQuantity: workspace.fabricationQuantity,
    geometry: structuredClone(workspace.geometry),
    sketchDocument: structuredClone(workspace.sketchDocument),
    draftVersion: workspace.draftVersion,
    workspaceSeq: workspace.workspaceSeq,
    capabilityEpoch: workspace.capabilityEpoch,
    authorityEpoch: workspace.authorityEpoch,
    specHash: hashSpecification(workspace),
    metadata: {
      material: workspace.geometry.material,
      thicknessMm: workspace.geometry.thickness,
    },
  };
}

export function collaborativeDraftFromUpdate(
  update: ArrayBuffer | Uint8Array,
): AttuneCollaborativeDraft | null {
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, new Uint8Array(update));
    const value = document.getMap('attune').get('draft');
    return isAttuneCollaborativeDraft(value) ? structuredClone(value) : null;
  } finally {
    document.destroy();
  }
}

export function authoritativeDraftUpdate(
  currentUpdate: ArrayBuffer | Uint8Array | null,
  workspace: AttuneWorkspace,
): Uint8Array {
  const document = new Y.Doc();
  try {
    if (currentUpdate) Y.applyUpdate(document, new Uint8Array(currentUpdate));
    const state = Y.encodeStateVector(document);
    document.transact(() => {
      document.getMap('attune').set('draft', collaborativeDraft(workspace));
    }, 'attune:authoritative-commit');
    return Y.encodeStateAsUpdate(document, state);
  } finally {
    document.destroy();
  }
}

const synchronizationQueue = new Map<string, Promise<void>>();

export async function syncAuthoritativeWorkspace(
  roomId: string,
  workspace: AttuneWorkspace,
): Promise<'synchronized' | 'already_current' | 'not_configured'> {
  if (!liveblocksConfigured()) return 'not_configured';
  let result: 'synchronized' | 'already_current' = 'synchronized';
  const previous = synchronizationQueue.get(roomId) ?? Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      const client = getLiveblocks();
      const current = await client.getYjsDocumentAsBinaryUpdate(roomId);
      const existing = collaborativeDraftFromUpdate(current);
      if (existing && existing.workspaceSeq >= workspace.workspaceSeq) {
        result = 'already_current';
        return;
      }
      await client.sendYjsBinaryUpdate(roomId, authoritativeDraftUpdate(current, workspace));
    });
  synchronizationQueue.set(roomId, operation);
  try {
    await operation;
    return result;
  } finally {
    if (synchronizationQueue.get(roomId) === operation) synchronizationQueue.delete(roomId);
  }
}

const AGENT_COLLABORATOR = {
  userId: 'attune-agent',
  userInfo: { name: 'Attune Agent', color: '#7c5ce7' },
} as const;

export function agentPresencePayload(
  activity: string,
  semanticRefs: {
    readonly entityIds?: readonly string[];
    readonly nodeIds?: readonly string[];
    readonly constraintIds?: readonly string[];
  } = {},
  ttl = 30,
) {
  return {
    ...AGENT_COLLABORATOR,
    data: {
      cursor: null,
      selectedEntityIds: [...(semanticRefs.entityIds ?? [])],
      selectedNodeIds: [...(semanticRefs.nodeIds ?? [])],
      selectedConstraintIds: [...(semanticRefs.constraintIds ?? [])],
      activeTool: 'agent',
      activity,
    },
    ttl,
  };
}

export async function setAgentPresence(
  roomId: string,
  activity: string,
  semanticRefs: {
    readonly entityIds?: readonly string[];
    readonly nodeIds?: readonly string[];
    readonly constraintIds?: readonly string[];
  } = {},
  ttl = 30,
): Promise<void> {
  if (!liveblocksConfigured()) return;
  await getLiveblocks().setPresence(roomId, agentPresencePayload(activity, semanticRefs, ttl));
}

function versionIdFromSnapshot(snapshot: unknown): string {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('LIVEBLOCKS_VERSION_MISSING');
  }
  const data = Reflect.get(snapshot, 'data');
  const versionId =
    typeof data === 'object' && data !== null
      ? Reflect.get(data, 'id')
      : Reflect.get(snapshot, 'id');
  if (typeof versionId !== 'string' || versionId.length === 0) {
    throw new Error('LIVEBLOCKS_VERSION_MISSING');
  }
  return versionId;
}

export async function snapshotCollaborativeDraft(
  roomId: string,
  authoritativeWorkspace: AttuneWorkspace,
): Promise<{ readonly versionId: string; readonly draft: AttuneCollaborativeDraft }> {
  const client = getLiveblocks();
  const snapshot = await client.createVersionHistorySnapshot(roomId);
  const versionId = versionIdFromSnapshot(snapshot);
  const update = await client.getYjsVersion({ roomId, versionId });
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, new Uint8Array(update));
    const value = document.getMap('attune').get('draft');
    if (!isAttuneCollaborativeDraft(value)) {
      throw new Error('COLLABORATIVE_DRAFT_MISSING');
    }
    if (hashSpecification(value) !== hashSpecification(authoritativeWorkspace)) {
      throw new Error('COLLABORATIVE_DRAFT_DRIFT');
    }
    return { versionId, draft: structuredClone(value) };
  } finally {
    document.destroy();
  }
}
