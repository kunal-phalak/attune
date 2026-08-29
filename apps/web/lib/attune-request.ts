import type { DeterministicRepair } from '@attune/domain';

import type { RepairExecutionInput } from './attune-runtime';

function isRepairId(value: unknown): value is DeterministicRepair['id'] {
  return value === 'move_slot_left_to_clearance' || value === 'narrow_slot_to_clearance';
}

function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }

  return value;
}

function optionalInteger(value: unknown, name: string): number | undefined {
  return value === undefined ? undefined : requiredInteger(value, name);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }

  return value;
}

export function parseObservationCursor(value: string | null): number | undefined {
  if (value === null) return undefined;
  return requiredInteger(Number(value), 'observation_cursor');
}

export function parseRepairExecutionInput(value: unknown): RepairExecutionInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('The command body must be an object.');
  }

  const repairId = Reflect.get(value, 'repairId');
  if (!isRepairId(repairId)) {
    throw new TypeError('repairId must identify a currently supported deterministic repair.');
  }

  return {
    repairId,
    commandId: requiredString(Reflect.get(value, 'commandId'), 'commandId'),
    expectedWorkspaceSeq: requiredInteger(
      Reflect.get(value, 'expectedWorkspaceSeq'),
      'expectedWorkspaceSeq',
    ),
    expectedCapabilityEpoch: requiredInteger(
      Reflect.get(value, 'expectedCapabilityEpoch'),
      'expectedCapabilityEpoch',
    ),
    observationCursor: optionalInteger(
      Reflect.get(value, 'observationCursor'),
      'observationCursor',
    ),
  };
}
