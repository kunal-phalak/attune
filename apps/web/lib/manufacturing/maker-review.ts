import type { AttuneWorkspace } from '@attune/domain';

export function workspaceForMakerReview(workspace: AttuneWorkspace): AttuneWorkspace {
  const versionIds = new Set(workspace.manufacturingRequests.map(({ versionId }) => versionId));
  const current = workspace.savedVersions.findLast(({ versionId }) => versionIds.has(versionId));
  return {
    ...workspace,
    ...(current
      ? {
          draftVersion: current.sourceDraftVersion,
          geometry: structuredClone(current.geometry),
          sketchDocument: structuredClone(current.sketchDocument),
        }
      : {}),
    savedVersions: workspace.savedVersions.filter(({ versionId }) => versionIds.has(versionId)),
  };
}
