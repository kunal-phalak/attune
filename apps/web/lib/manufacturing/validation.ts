import type { PanelGeometry, ProviderCapabilityProfile } from '@attune/domain';

function roundMillimetres(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function calculateSlotRightClearance(geometry: PanelGeometry): number {
  return roundMillimetres(geometry.width - geometry.slot.center.x - geometry.slot.width / 2);
}

export function validateUniversalGeometry(
  geometry: PanelGeometry,
): readonly { readonly id: string; readonly message: string }[] {
  const dimensions = [geometry.width, geometry.height, geometry.thickness];
  const circles = [...geometry.mounts, ...geometry.auxiliaryHoles, ...geometry.circularCutouts];
  const rectangles = [geometry.slot, ...geometry.ventSlots, ...geometry.rectangularCutouts];
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
  const rectanglesContained = rectangles.every(
    ({ center, width, height }) =>
      width > 0 &&
      height > 0 &&
      center.x - width / 2 >= 0 &&
      center.y - height / 2 >= 0 &&
      center.x + width / 2 <= geometry.width &&
      center.y + height / 2 <= geometry.height,
  );
  return [
    ...(dimensions.every((value) => Number.isFinite(value) && value > 0)
      ? []
      : [{ id: 'invalid_panel', message: 'The sheet dimensions must be finite and positive.' }]),
    ...(circlesContained && rectanglesContained
      ? []
      : [
          {
            id: 'feature_outside_profile',
            message: 'Every cut feature must remain inside the outer profile.',
          },
        ]),
  ];
}

function exceeds(value: number, limit: number | 'ANY' | 'UNSPECIFIED'): boolean {
  return typeof limit === 'number' && value > limit;
}

export function validateProviderCapability(
  geometry: PanelGeometry,
  profile: ProviderCapabilityProfile,
): readonly { readonly id: string; readonly message: string }[] {
  const process = profile.processes[0];
  const material = Array.isArray(profile.materials)
    ? profile.materials.find((candidate) => candidate.material === geometry.material)
    : undefined;
  const thicknesses = material?.thicknessesMm;
  const holes = [...geometry.mounts, ...geometry.auxiliaryHoles, ...geometry.circularCutouts];
  const slots = [geometry.slot, ...geometry.ventSlots];
  const envelopeExceeded =
    process &&
    (exceeds(geometry.width, process.workEnvelopeMm.width) ||
      exceeds(geometry.height, process.workEnvelopeMm.height) ||
      exceeds(geometry.thickness, process.workEnvelopeMm.thickness));
  const holeMinimum = profile.minimums.holeDiameterMm;
  const slotMinimum = profile.minimums.slotWidthMm;
  const clearanceMinimum = profile.minimums.edgeClearanceMm;
  return [
    ...(envelopeExceeded
      ? [
          {
            id: 'provider_work_envelope',
            message: 'The design exceeds the declared work envelope.',
          },
        ]
      : []),
    ...(Array.isArray(profile.materials) && !material
      ? [
          {
            id: 'provider_material',
            message: `${geometry.material} is not in the declared material list.`,
          },
        ]
      : []),
    ...(Array.isArray(thicknesses) && !thicknesses.includes(geometry.thickness)
      ? [
          {
            id: 'provider_thickness',
            message: `${geometry.thickness} mm is not a declared thickness.`,
          },
        ]
      : []),
    ...(typeof holeMinimum === 'number' && holes.some(({ diameter }) => diameter < holeMinimum)
      ? [
          {
            id: 'provider_hole_minimum',
            message: `A hole is below the ${holeMinimum} mm minimum.`,
          },
        ]
      : []),
    ...(typeof slotMinimum === 'number' &&
    slots.some(({ width, height }) => Math.min(width, height) < slotMinimum)
      ? [
          {
            id: 'provider_slot_minimum',
            message: `A slot is below the ${slotMinimum} mm minimum.`,
          },
        ]
      : []),
    ...(typeof clearanceMinimum === 'number' &&
    calculateSlotRightClearance(geometry) < clearanceMinimum
      ? [
          {
            id: 'slot_clearance',
            message: `Edge clearance is below the ${clearanceMinimum} mm minimum.`,
          },
        ]
      : []),
  ];
}
