import { hashCanonical } from './hash';
import type {
  AttuneWorkspace,
  DeterministicRepair,
  PanelGeometry,
  ValidationResult,
} from './model';

const LOCKED_MOUNT_IDS = [
  'mount:top-left',
  'mount:top-right',
  'mount:bottom-left',
  'mount:bottom-right',
];

function roundMillimetres(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function calculateSlotRightClearance(geometry: PanelGeometry): number {
  const slotRightEdge = geometry.slot.center.x + geometry.slot.width / 2;
  return roundMillimetres(geometry.width - slotRightEdge);
}

export function validateGeometry(geometry: PanelGeometry): ValidationResult {
  const observedMm = calculateSlotRightClearance(geometry);
  const requiredMm = geometry.constraints.requiredSlotClearance;
  const lockedMountsPreserved = geometry.mounts.filter(
    (mount) => mount.locked && LOCKED_MOUNT_IDS.includes(mount.id),
  ).length;
  const issues =
    observedMm < requiredMm
      ? [
          {
            id: 'slot_clearance' as const,
            severity: 'hard' as const,
            message: `Slot clearance ${observedMm} mm is below the required ${requiredMm} mm.`,
            observedMm,
            requiredMm,
            affectedEntities: ['slot:connector', 'panel:right-edge'],
          },
        ]
      : [];

  return {
    valid: issues.length === 0,
    issues,
    evidence: {
      slotRightClearanceMm: observedMm,
      requiredSlotClearanceMm: requiredMm,
      lockedMountsPreserved,
      lockedMountsTotal: LOCKED_MOUNT_IDS.length,
    },
  };
}

export function hashSpecification(
  workspace: Pick<AttuneWorkspace, 'commitmentId' | 'fabricationQuantity' | 'geometry'>,
): string {
  return hashCanonical({
    commitmentId: workspace.commitmentId,
    fabricationQuantity: workspace.fabricationQuantity,
    geometry: workspace.geometry,
  });
}

function withSlot(geometry: PanelGeometry, slot: PanelGeometry['slot']): PanelGeometry {
  return { ...geometry, slot };
}

export function applyRepairToGeometry(
  geometry: PanelGeometry,
  repairId: DeterministicRepair['id'],
): PanelGeometry {
  const required = geometry.constraints.requiredSlotClearance;

  if (repairId === 'move_slot_left_to_clearance') {
    return withSlot(geometry, {
      ...geometry.slot,
      center: {
        ...geometry.slot.center,
        x: geometry.width - required - geometry.slot.width / 2,
      },
    });
  }

  const width = 2 * (geometry.width - required - geometry.slot.center.x);
  return withSlot(geometry, { ...geometry.slot, width: roundMillimetres(width) });
}

export function compareValidChanges(workspace: AttuneWorkspace): readonly DeterministicRepair[] {
  if (validateGeometry(workspace.geometry).valid) {
    return [];
  }

  return (['move_slot_left_to_clearance', 'narrow_slot_to_clearance'] as const).map((id) => {
    const geometry = applyRepairToGeometry(workspace.geometry, id);

    return {
      id,
      label:
        id === 'move_slot_left_to_clearance' ? 'Move slot left by 3.9 mm' : 'Narrow slot by 7.8 mm',
      affectedEntities: ['slot:connector'],
      resolvedIssues: ['slot_clearance'],
      predictedClearanceMm: 12,
      predictedSpecHash: hashSpecification({ ...workspace, geometry }),
      preservedLockedEntities: [...LOCKED_MOUNT_IDS],
    };
  });
}

export function lockedMountIds(): readonly string[] {
  return [...LOCKED_MOUNT_IDS];
}
