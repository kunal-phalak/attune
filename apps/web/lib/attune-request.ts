import type { CommandEnvelope } from '@attune/command-bus';
import type {
  AttuneCommand,
  AttuneCommandType,
  AttuneRole,
  DeterministicRepair,
  CommandFootprint,
  SelectionContextRequest,
} from '@attune/domain';

import type { CommandExecutionInput } from './attune-runtime';
import { isSketchCommandType, parseSketchCommand } from './sketch/sketch-command-parser';

const ENVELOPE_KEYS = [
  'command',
  'commandId',
  'expectedWorkspaceSeq',
  'expectedCapabilityEpoch',
  'expectedAuthorityEpoch',
  'expectedSpecHash',
  'observationCursor',
  'footprint',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new TypeError(`${name} contains unsupported fields: ${unexpected.join(', ')}.`);
  }
}

function isRepairId(value: unknown): value is DeterministicRepair['id'] {
  return value === 'move_slot_left_to_clearance' || value === 'narrow_slot_to_clearance';
}

function isCommandType(value: string): value is AttuneCommandType {
  return (
    isSketchCommandType(value) ||
    [
      'apply_deterministic_repair',
      'move_slot',
      'request_quote',
      'freeze_and_quote_revision',
      'accept_revision',
      'materialize_for_commerce',
    ].includes(value)
  );
}

function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }

  return value;
}

function requiredNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }

  return value;
}

function optionalInteger(value: unknown, name: string): number | undefined {
  return value === undefined ? undefined : requiredInteger(value, name);
}

function requiredIdentifier(value: unknown, name: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 160 ||
    !/^[a-zA-Z0-9:_-]+$/.test(value)
  ) {
    throw new TypeError(`${name} must be a safe non-empty identifier.`);
  }

  return value;
}

function requiredSpecHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError('expectedSpecHash must be a SHA-256 hexadecimal digest.');
  }

  return value;
}

function parseRepairCommand(value: Record<string, unknown>): AttuneCommand {
  assertExactKeys(value, ['type', 'repairId'], 'repair command');
  const repairId = value.repairId;
  if (!isRepairId(repairId)) {
    throw new TypeError('repairId must identify a currently supported deterministic repair.');
  }
  return { type: 'apply_deterministic_repair', repairId };
}

function parseMoveCommand(value: Record<string, unknown>): AttuneCommand {
  assertExactKeys(value, ['type', 'centerX', 'centerY'], 'move command');
  return {
    type: 'move_slot',
    centerX: requiredNumber(value.centerX, 'centerX'),
    centerY: requiredNumber(value.centerY, 'centerY'),
  };
}

function parseEmptyCommand(
  value: Record<string, unknown>,
  type: 'request_quote' | 'freeze_and_quote_revision',
): AttuneCommand {
  assertExactKeys(value, ['type'], `${type} command`);
  return { type };
}

function parseAcceptanceCommand(value: Record<string, unknown>): AttuneCommand {
  assertExactKeys(value, ['type', 'revisionId', 'quoteId'], 'acceptance command');
  return {
    type: 'accept_revision',
    revisionId: requiredIdentifier(value.revisionId, 'revisionId'),
    quoteId: requiredIdentifier(value.quoteId, 'quoteId'),
  };
}

function parseCommand(value: unknown, allowedTypes: ReadonlySet<AttuneCommandType>): AttuneCommand {
  if (!isObject(value)) throw new TypeError('command must be an object.');
  const type = value.type;
  if (typeof type !== 'string' || !isCommandType(type) || !allowedTypes.has(type)) {
    throw new TypeError('command.type is not allowed on this trusted execution path.');
  }
  if (isSketchCommandType(type)) return parseSketchCommand(value);

  switch (type) {
    case 'apply_deterministic_repair':
      return parseRepairCommand(value);
    case 'move_slot':
      return parseMoveCommand(value);
    case 'request_quote':
      return parseEmptyCommand(value, type);
    case 'freeze_and_quote_revision':
      return parseEmptyCommand(value, type);
    case 'accept_revision':
      return parseAcceptanceCommand(value);
    default:
      throw new TypeError('The requested command is not accepted from browser input.');
  }
}

function parseFootprint(value: unknown): CommandFootprint | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new TypeError('footprint must be an object.');
  assertExactKeys(
    value,
    [
      'documentId',
      'documentRevision',
      'reads',
      'writes',
      'versions',
      'entityIds',
      'nodeIds',
      'groupIds',
      'constraintIds',
      'dimensionIds',
      'authorityDependencies',
    ],
    'footprint',
  );
  const parseIds = (candidate: unknown, name: string) => {
    if (!Array.isArray(candidate)) throw new TypeError(`${name} must be an array.`);
    return candidate.map((item) => requiredIdentifier(item, name));
  };
  if (!isObject(value.versions)) throw new TypeError('footprint.versions must be an object.');
  const versions = Object.fromEntries(
    Object.entries(value.versions).map(([reference, version]) => [
      requiredIdentifier(reference, 'footprint reference'),
      requiredInteger(version, `footprint.versions.${reference}`),
    ]),
  );
  return {
    documentId: requiredIdentifier(value.documentId, 'footprint.documentId'),
    documentRevision: requiredInteger(value.documentRevision, 'footprint.documentRevision'),
    reads: parseIds(value.reads, 'footprint.reads'),
    writes: parseIds(value.writes, 'footprint.writes'),
    versions,
    entityIds: parseIds(value.entityIds ?? [], 'footprint.entityIds'),
    nodeIds: parseIds(value.nodeIds ?? [], 'footprint.nodeIds'),
    groupIds: parseIds(value.groupIds ?? [], 'footprint.groupIds'),
    constraintIds: parseIds(value.constraintIds ?? [], 'footprint.constraintIds'),
    dimensionIds: parseIds(value.dimensionIds ?? [], 'footprint.dimensionIds'),
    authorityDependencies: ['sketch:document', 'authority:workspace'],
  };
}

function parseEnvelope(value: Record<string, unknown>): CommandEnvelope {
  return {
    commandId: requiredIdentifier(value.commandId, 'commandId'),
    expectedWorkspaceSeq: requiredInteger(value.expectedWorkspaceSeq, 'expectedWorkspaceSeq'),
    expectedCapabilityEpoch: requiredInteger(
      value.expectedCapabilityEpoch,
      'expectedCapabilityEpoch',
    ),
    expectedAuthorityEpoch: requiredInteger(value.expectedAuthorityEpoch, 'expectedAuthorityEpoch'),
    expectedSpecHash: requiredSpecHash(value.expectedSpecHash),
    observationCursor: optionalInteger(value.observationCursor, 'observationCursor'),
    footprint: parseFootprint(value.footprint),
  };
}

export function parseForecastCommandInput(
  value: unknown,
  allowedTypes: readonly AttuneCommandType[],
): AttuneCommand {
  if (!isObject(value)) throw new TypeError('The forecast body must be an object.');
  assertExactKeys(value, ['command'], 'forecast body');
  return parseCommand(value.command, new Set(allowedTypes));
}

export function parseObservationCursor(value: string | null): number | undefined {
  if (value === null) return undefined;
  return requiredInteger(Number(value), 'observation_cursor');
}

function commaSeparatedIds(value: string | null, name: string): readonly string[] | undefined {
  if (value === null || value.length === 0) return undefined;
  const values = value.split(',');
  if (values.length > 100) throw new TypeError(`${name} contains too many references.`);
  return values.map((candidate) => requiredIdentifier(candidate, name));
}

export function parseAgentContextFocus(parameters: URLSearchParams): SelectionContextRequest {
  const entityIds = commaSeparatedIds(parameters.get('entity_ids'), 'entity_ids');
  const nodeIds = commaSeparatedIds(parameters.get('node_ids'), 'node_ids');
  const constraintIds = commaSeparatedIds(parameters.get('constraint_ids'), 'constraint_ids');
  const groupIds = commaSeparatedIds(parameters.get('group_ids'), 'group_ids');
  const activeGroupId = parameters.get('active_group_id');
  const activeHumanTool = parameters.get('active_human_tool');
  const regionValues = [
    parameters.get('min_x'),
    parameters.get('min_y'),
    parameters.get('max_x'),
    parameters.get('max_y'),
  ];
  const hasRegion = regionValues.some((value) => value !== null);
  if (hasRegion && regionValues.some((value) => value === null)) {
    throw new TypeError('A world region requires min_x, min_y, max_x, and max_y.');
  }
  const worldRegion = hasRegion
    ? {
        minX: requiredNumber(Number(regionValues[0]), 'min_x'),
        minY: requiredNumber(Number(regionValues[1]), 'min_y'),
        maxX: requiredNumber(Number(regionValues[2]), 'max_x'),
        maxY: requiredNumber(Number(regionValues[3]), 'max_y'),
      }
    : undefined;
  return {
    ...(entityIds ? { entityIds } : {}),
    ...(nodeIds ? { nodeIds } : {}),
    ...(constraintIds ? { constraintIds } : {}),
    ...(groupIds ? { groupIds } : {}),
    ...(activeGroupId
      ? { activeGroupId: requiredIdentifier(activeGroupId, 'active_group_id') }
      : {}),
    ...(activeHumanTool
      ? { activeHumanTool: requiredIdentifier(activeHumanTool, 'active_human_tool') }
      : {}),
    ...(worldRegion ? { worldRegion } : {}),
  };
}

export function parseWorkspaceId(value: string | null): string {
  return requiredIdentifier(value, 'workspace_id');
}

export function parseDelegatedRole(
  value: string | null,
): Extract<AttuneRole, 'buyer' | 'provider'> {
  if (value === 'buyer' || value === 'provider') return value;
  throw new TypeError('perspective must be buyer or provider.');
}

export function parseCommandExecutionInput(
  value: unknown,
  allowedTypes: readonly AttuneCommandType[],
): CommandExecutionInput {
  if (!isObject(value)) throw new TypeError('The command body must be an object.');
  assertExactKeys(value, ENVELOPE_KEYS, 'command body');
  return {
    command: parseCommand(value.command, new Set(allowedTypes)),
    envelope: parseEnvelope(value),
  };
}

export interface MaterializationExecutionInput {
  readonly revisionId: string;
  readonly envelope: CommandEnvelope;
}

export function parseMaterializationExecutionInput(value: unknown): MaterializationExecutionInput {
  if (!isObject(value)) throw new TypeError('The command body must be an object.');
  assertExactKeys(value, ENVELOPE_KEYS, 'command body');
  const command = value.command;
  if (!isObject(command)) throw new TypeError('command must be an object.');
  assertExactKeys(command, ['type', 'revisionId'], 'materialization command');
  if (command.type !== 'materialize_for_commerce') {
    throw new TypeError('Only materialize_for_commerce is accepted by this endpoint.');
  }
  return {
    revisionId: requiredIdentifier(command.revisionId, 'revisionId'),
    envelope: parseEnvelope(value),
  };
}
