import { describe, expect, it } from 'vitest';

import {
  applyRepairToGeometry,
  calculateSlotRightClearance,
  compareValidChanges,
  createAt1042Workspace,
  hashSpecification,
  validateWorkspace,
} from './index';

describe('AT-1042 deterministic geometry', () => {
  it('starts with the exact 8.1 mm hard conflict against a 12 mm requirement', () => {
    const workspace = createAt1042Workspace();
    const validation = validateWorkspace(workspace);

    expect(calculateSlotRightClearance(workspace.geometry)).toBe(8.1);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual([
      expect.objectContaining({
        id: 'slot_clearance',
        severity: 'hard',
        observedMm: 8.1,
        requiredMm: 12,
      }),
    ]);
    expect(validation.evidence.lockedMountsPreserved).toBe(4);
  });

  it('offers two deterministic repairs with exact predicted hashes and lock preservation', () => {
    const workspace = createAt1042Workspace();
    const repairs = compareValidChanges(workspace);

    expect(repairs.map((repair) => repair.id)).toEqual([
      'move_slot_left_to_clearance',
      'narrow_slot_to_clearance',
    ]);
    expect(repairs.every((repair) => repair.predictedClearanceMm === 12)).toBe(true);
    expect(repairs.every((repair) => repair.preservedLockedEntities.length === 4)).toBe(true);

    for (const repair of repairs) {
      const geometry = applyRepairToGeometry(workspace.geometry, repair.id);
      expect(validateWorkspace({ ...workspace, geometry }).valid).toBe(true);
      expect(hashSpecification({ ...workspace, geometry })).toBe(repair.predictedSpecHash);
    }
  });
});
