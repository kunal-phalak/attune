import { createAt1042Workspace, transitionWorkspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { workspaceForMakerReview } from './maker-review';

describe('Maker exact-version workspace projection', () => {
  it('shows the submitted immutable version instead of later buyer draft geometry', () => {
    const base = createAt1042Workspace();
    const repaired = transitionWorkspace(
      base,
      { type: 'apply_deterministic_repair', repairId: 'move_slot_left_to_clearance' },
      { commandId: 'repair', now: '2026-09-03T00:00:00.000Z' },
    ).workspace;
    const requested = transitionWorkspace(
      repaired,
      { type: 'request_quote', buyerPrincipalId: 'user:buyer' },
      { commandId: 'request', now: '2026-09-03T00:01:00.000Z' },
    ).workspace;
    const edited = transitionWorkspace(
      requested,
      { type: 'move_slot', centerX: 35, centerY: 90 },
      { commandId: 'buyer-edit', now: '2026-09-03T00:02:00.000Z' },
    ).workspace;

    const maker = workspaceForMakerReview(edited);
    expect(maker.geometry).toEqual(requested.savedVersions[0].geometry);
    expect(maker.sketchDocument).toEqual(requested.savedVersions[0].sketchDocument);
    expect(maker.geometry).not.toEqual(edited.geometry);
    expect(maker.savedVersions).toHaveLength(1);
  });
});
