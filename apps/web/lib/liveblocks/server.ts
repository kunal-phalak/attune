import { hashSpecification, type AttuneWorkspace } from '@attune/domain';
import { Liveblocks } from '@liveblocks/node';
import * as Y from 'yjs';

import type { AttuneCollaborativeDraft } from '../../liveblocks.config';

let liveblocks: Liveblocks | undefined;

export function liveblocksConfigured(): boolean {
  return Boolean(process.env.LIVEBLOCKS_SECRET_KEY);
}

export function getLiveblocks(): Liveblocks {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new Error('LIVEBLOCKS_SECRET_KEY is required for workspace collaboration.');
  liveblocks ??= new Liveblocks({ secret });
  return liveblocks;
}

function isCollaborativeDraft(value: unknown): value is AttuneCollaborativeDraft {
  if (typeof value !== 'object' || value === null) return false;
  const geometry = Reflect.get(value, 'geometry');
  return (
    Reflect.get(value, 'commitmentId') === 'AT-1042' &&
    Reflect.get(value, 'fabricationQuantity') === 4 &&
    Number.isInteger(Reflect.get(value, 'draftVersion')) &&
    typeof geometry === 'object' &&
    geometry !== null
  );
}

export function collaborativeDraft(workspace: AttuneWorkspace): AttuneCollaborativeDraft {
  return {
    intent: 'Fabricate a custom equipment panel with four protected buyer mounts.',
    commitmentId: workspace.commitmentId,
    fabricationQuantity: workspace.fabricationQuantity,
    geometry: structuredClone(workspace.geometry),
    draftVersion: workspace.draftVersion,
    metadata: {
      material: workspace.geometry.material,
      thicknessMm: workspace.geometry.thickness,
    },
  };
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
    if (!isCollaborativeDraft(value)) {
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
