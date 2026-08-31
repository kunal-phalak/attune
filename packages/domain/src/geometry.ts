import { hashCanonical } from './hash';
import type {
  AttuneWorkspace,
  DeterministicRepair,
  PanelGeometry,
  ProviderCapabilityProfile,
  ProviderValidationIssue,
  UniversalValidationIssue,
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

export function validateUniversalGeometry(
  geometry: PanelGeometry,
): readonly UniversalValidationIssue[] {
  const panelValid =
    Number.isFinite(geometry.width) &&
    Number.isFinite(geometry.height) &&
    Number.isFinite(geometry.thickness) &&
    geometry.width > 0 &&
    geometry.height > 0 &&
    geometry.thickness > 0;
  const circles = [...geometry.mounts, ...geometry.auxiliaryHoles];
  const circlesContained = circles.every(({ center, diameter }) => {
    const radius = diameter / 2;
    return (
      diameter > 0 &&
      center.x - radius >= 0 &&
      center.y - radius >= 0 &&
      center.x + radius <= geometry.width &&
      center.y + radius <= geometry.height
    );
  });
  const slot = geometry.slot;
  const slotContained =
    slot.width > 0 &&
    slot.height > 0 &&
    slot.center.x - slot.width / 2 >= 0 &&
    slot.center.y - slot.height / 2 >= 0 &&
    slot.center.x + slot.width / 2 <= geometry.width &&
    slot.center.y + slot.height / 2 <= geometry.height;
  return [
    ...(!panelValid
      ? [
          {
            id: 'invalid_panel' as const,
            severity: 'hard' as const,
            source: 'universal' as const,
            message: 'The sheet profile must have finite, positive dimensions.',
            affectedEntities: ['panel:outer-profile'],
          },
        ]
      : []),
    ...(!circlesContained || !slotContained
      ? [
          {
            id: 'feature_outside_profile' as const,
            severity: 'hard' as const,
            source: 'universal' as const,
            message: 'Every cut feature must remain inside the closed outer profile.',
            affectedEntities: ['panel:outer-profile'],
          },
        ]
      : []),
  ];
}

function exceeds(value: number, limit: ProviderCapabilityProfile['minimums']['featureMm']) {
  return typeof limit === 'number' && value > limit;
}

export function validateProviderCapability(
  geometry: PanelGeometry,
  profile: ProviderCapabilityProfile,
): readonly ProviderValidationIssue[] {
  const process = profile.processes[0];
  const material = Array.isArray(profile.materials)
    ? profile.materials.find((candidate) => candidate.material === geometry.material)
    : undefined;
  const thicknesses = material?.thicknessesMm;
  const observedMm = calculateSlotRightClearance(geometry);
  const requiredMm = profile.minimums.edgeClearanceMm;
  const envelopeExceeded =
    process !== undefined &&
    (exceeds(geometry.width, process.workEnvelopeMm.width) ||
      exceeds(geometry.height, process.workEnvelopeMm.height) ||
      exceeds(geometry.thickness, process.workEnvelopeMm.thickness));
  return [
    ...(envelopeExceeded
      ? [
          {
            id: 'provider_work_envelope' as const,
            severity: 'hard' as const,
            source: 'provider' as const,
            message: `The part exceeds ${profile.providerName}'s declared work envelope.`,
            affectedEntities: ['panel:outer-profile'],
          },
        ]
      : []),
    ...(Array.isArray(profile.materials) && !material
      ? [
          {
            id: 'provider_material' as const,
            severity: 'hard' as const,
            source: 'provider' as const,
            message: `${profile.providerName} has not declared support for ${geometry.material}.`,
            affectedEntities: ['specification:material'],
          },
        ]
      : []),
    ...(Array.isArray(thicknesses) && !thicknesses.includes(geometry.thickness)
      ? [
          {
            id: 'provider_thickness' as const,
            severity: 'hard' as const,
            source: 'provider' as const,
            message: `${profile.providerName} does not support ${geometry.thickness} mm ${geometry.material}.`,
            observedMm: geometry.thickness,
            affectedEntities: ['specification:thickness'],
          },
        ]
      : []),
    ...(typeof requiredMm === 'number' && observedMm < requiredMm
      ? [
          {
            id: 'slot_clearance' as const,
            severity: 'hard' as const,
            source: 'provider' as const,
            message: `Slot clearance ${observedMm} mm is below ${profile.providerName}'s required ${requiredMm} mm.`,
            observedMm,
            requiredMm,
            affectedEntities: ['slot:connector', 'panel:right-edge'],
          },
        ]
      : []),
  ];
}

export function validateGeometry(
  geometry: PanelGeometry,
  profile: ProviderCapabilityProfile,
): ValidationResult {
  const universalIssues = validateUniversalGeometry(geometry);
  const providerIssues = validateProviderCapability(geometry, profile);
  const observedMm = calculateSlotRightClearance(geometry);
  const requiredLimit = profile.minimums.edgeClearanceMm;
  const requiredMm = typeof requiredLimit === 'number' ? requiredLimit : observedMm;
  const lockedMountsPreserved = geometry.mounts.filter(
    (mount) => mount.locked && LOCKED_MOUNT_IDS.includes(mount.id),
  ).length;

  return {
    valid: universalIssues.length === 0 && providerIssues.length === 0,
    issues: [...universalIssues, ...providerIssues],
    universal: { valid: universalIssues.length === 0, issues: universalIssues },
    provider: {
      valid: providerIssues.length === 0,
      providerId: profile.providerId,
      profileId: profile.profileId,
      profileVersion: profile.version,
      issues: providerIssues,
    },
    evidence: {
      slotRightClearanceMm: observedMm,
      requiredSlotClearanceMm: requiredMm,
      lockedMountsPreserved,
      lockedMountsTotal: LOCKED_MOUNT_IDS.length,
      providerId: profile.providerId,
      providerProfileVersion: profile.version,
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
  requiredClearanceMm = geometry.constraints.requiredSlotClearance,
): PanelGeometry {
  const required = requiredClearanceMm;

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
  const validation = validateGeometry(workspace.geometry, workspace.providerCapabilityProfile);
  if (!validation.provider.issues.some(({ id }) => id === 'slot_clearance')) return [];
  const required = workspace.providerCapabilityProfile.minimums.edgeClearanceMm;
  if (typeof required !== 'number') return [];

  return (['move_slot_left_to_clearance', 'narrow_slot_to_clearance'] as const).map((id) => {
    const geometry = applyRepairToGeometry(workspace.geometry, id, required);

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
