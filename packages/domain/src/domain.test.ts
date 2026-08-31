import { describe, expect, it } from 'vitest';

import {
  applyRepairToGeometry,
  calculateSlotRightClearance,
  compareValidChanges,
  createAt1042Workspace,
  hashSpecification,
  validateProviderCapability,
  validateUniversalGeometry,
  validateWorkspace,
} from './index';

describe('AT-1042 deterministic geometry', () => {
  it('models a substantial but honest 2D control-enclosure faceplate', () => {
    const { geometry } = createAt1042Workspace();

    expect(geometry).toEqual(
      expect.objectContaining({ width: 420, height: 280, thickness: 3, material: 'aluminium' }),
    );
    expect(geometry.mounts.filter(({ locked }) => locked)).toHaveLength(4);
    expect(geometry.rectangularCutouts.map(({ id }) => id)).toEqual([
      'cutout:display',
      'cutout:secondary-control',
    ]);
    expect(geometry.circularCutouts.map(({ id }) => id)).toEqual(['cutout:fan']);
    expect(geometry.auxiliaryHoles).toHaveLength(3);
    expect(geometry.ventSlots).toHaveLength(6);
  });

  it('starts with the exact 8.1 mm hard conflict against a 12 mm requirement', () => {
    const workspace = createAt1042Workspace();
    const validation = validateWorkspace(workspace);

    expect(calculateSlotRightClearance(workspace.geometry)).toBe(8.1);
    expect(validation.valid).toBe(false);
    expect(validation.universal.valid).toBe(true);
    expect(validation.provider.valid).toBe(false);
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

  it('separates universal validity from the selected provider profile and respects unspecified limits', () => {
    const workspace = createAt1042Workspace();
    const unrestrictedProfile = {
      ...workspace.providerCapabilityProfile,
      processes: [],
      materials: 'UNSPECIFIED' as const,
      minimums: {
        featureMm: 'UNSPECIFIED' as const,
        holeDiameterMm: 'UNSPECIFIED' as const,
        slotWidthMm: 'UNSPECIFIED' as const,
        edgeClearanceMm: 'UNSPECIFIED' as const,
        spacingWebMm: 'UNSPECIFIED' as const,
        toolRadiusMm: 'UNSPECIFIED' as const,
        kerfMm: 'UNSPECIFIED' as const,
      },
    };

    expect(validateUniversalGeometry(workspace.geometry)).toEqual([]);
    expect(validateProviderCapability(workspace.geometry, unrestrictedProfile)).toEqual([]);
    expect(
      validateProviderCapability(workspace.geometry, workspace.providerCapabilityProfile),
    ).toEqual([expect.objectContaining({ id: 'slot_clearance', source: 'provider' })]);
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
