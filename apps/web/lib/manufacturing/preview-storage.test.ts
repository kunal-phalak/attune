import { createAt1042Workspace, transitionWorkspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { versionPreviewKey } from './preview-storage';
import { renderVersionPreview } from './version-preview';

describe('exact saved-version previews', () => {
  it('renders a real PNG and uses a version-scoped private object key', async () => {
    const saved = transitionWorkspace(
      createAt1042Workspace(),
      { type: 'save_design_version', name: 'Mounting plate' },
      { commandId: 'saved-1', now: '2026-09-03T00:00:00.000Z' },
    ).workspace.savedVersions[0];
    const image = await renderVersionPreview(saved);

    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(image.byteLength).toBeGreaterThan(1_000);
    expect(versionPreviewKey('workspace:test', saved.versionId)).toBe(
      'workspaces/workspace:test/versions/version:saved-1/preview.png',
    );
  });
});
