import { createAt1042Workspace, transitionWorkspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { PreviewStorage } from './preview-storage';
import { renderVersionPreview } from './version-preview';

describe.runIf(process.env.ATTUNE_LIVE_R2 === '1')('live R2 exact preview', () => {
  it('uploads, confirms, signs, and reads a challenge-safe exact version PNG', async () => {
    const repaired = transitionWorkspace(
      createAt1042Workspace(),
      { type: 'apply_deterministic_repair', repairId: 'move_slot_left_to_clearance' },
      { commandId: 'r2-live-repair', now: '2026-09-03T00:00:00.000Z' },
    ).workspace;
    const version = transitionWorkspace(
      repaired,
      { type: 'save_design_version', name: 'Challenge release R2 verification' },
      { commandId: 'r2-live-release', now: '2026-09-03T00:00:01.000Z' },
    ).workspace.savedVersions[0];
    const body = await renderVersionPreview(version);
    const storage = new PreviewStorage();
    const key = await storage.putVersionPreview({
      workspaceId: 'workspace:judge-release-verification',
      version,
      body,
    });
    const head = await storage.headVersionPreview(key);
    expect(head).toMatchObject({
      contentLength: body.byteLength,
      contentType: 'image/png',
    });
    expect(head.etag).toBeTruthy();

    const signedUrl = await storage.getSignedPreviewUrl(key, 300);
    const response = await fetch(signedUrl, { cache: 'no-store' });
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('image/png');
    const downloaded = new Uint8Array(await response.arrayBuffer());
    expect([...downloaded.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(downloaded.byteLength).toBe(body.byteLength);
  });
});
