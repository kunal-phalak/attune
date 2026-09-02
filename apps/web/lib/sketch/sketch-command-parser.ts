import type {
  AttuneCommand,
  ConstraintInput,
  ConstraintType,
  DimensionInput,
  GeometryAnchor,
  GeometryInput,
  GeometryPatch,
  GeometryReference,
  GroupInput,
  SketchCommandType,
} from '@attune/domain';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}

function exact(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0)
    throw new TypeError(`${name} contains unsupported fields: ${extra.join(', ')}.`);
}

function id(value: unknown, name: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 160 ||
    !/^[a-zA-Z0-9:_-]+$/.test(value)
  ) {
    throw new TypeError(`${name} must be a stable public reference.`);
  }
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}

function point(value: unknown, name: string) {
  const input = object(value, name);
  exact(input, ['x', 'y'], name);
  return { x: number(input.x, `${name}.x`), y: number(input.y, `${name}.y`) };
}

function stringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  return value.map((candidate, index) => id(candidate, `${name}[${index}]`));
}

function geometry(value: unknown, patch: false): GeometryInput;
function geometry(value: unknown, patch: true): GeometryPatch;
function geometry(value: unknown, patch: boolean): GeometryInput | GeometryPatch {
  const input = object(value, 'geometry');
  const kind = input.kind;
  const base = patch ? ['id', 'kind'] : ['id', 'kind', 'name', 'construction'];
  const common = {
    id: id(input.id, 'geometry.id'),
    ...(patch
      ? {}
      : {
          ...(typeof input.name === 'string' ? { name: input.name.slice(0, 160) } : {}),
          ...(typeof input.construction === 'boolean' ? { construction: input.construction } : {}),
        }),
  };
  if (kind === 'point') {
    exact(input, [...base, 'position'], 'point geometry');
    return { ...common, kind, position: point(input.position, 'geometry.position') };
  }
  if (kind === 'line') {
    exact(input, [...base, 'start', 'end'], 'line geometry');
    return {
      ...common,
      kind,
      start: point(input.start, 'geometry.start'),
      end: point(input.end, 'geometry.end'),
    };
  }
  if (kind === 'circle') {
    exact(input, [...base, 'center', 'radius'], 'circle geometry');
    return {
      ...common,
      kind,
      center: point(input.center, 'geometry.center'),
      radius: number(input.radius, 'geometry.radius'),
    };
  }
  if (kind === 'arc') {
    exact(input, [...base, 'center', 'radius', 'startAngle', 'endAngle'], 'arc geometry');
    return {
      ...common,
      kind,
      center: point(input.center, 'geometry.center'),
      radius: number(input.radius, 'geometry.radius'),
      startAngle: number(input.startAngle, 'geometry.startAngle'),
      endAngle: number(input.endAngle, 'geometry.endAngle'),
    };
  }
  throw new TypeError('geometry.kind must be point, line, circle, or arc.');
}

function geometryAnchor(value: unknown): GeometryAnchor | undefined {
  if (value === undefined) return undefined;
  if (value === 'self' || value === 'start' || value === 'end' || value === 'center') return value;
  throw new TypeError('geometry reference anchor is invalid.');
}

function reference(value: unknown): GeometryReference {
  const input = object(value, 'geometry reference');
  exact(input, ['entityId', 'anchor'], 'geometry reference');
  const anchor = geometryAnchor(input.anchor);
  return {
    entityId: id(input.entityId, 'geometry reference.entityId'),
    ...(anchor ? { anchor } : {}),
  };
}

function refs(value: unknown): readonly GeometryReference[] {
  if (!Array.isArray(value)) throw new TypeError('refs must be an array.');
  return value.map(reference);
}

function drivingValue(value: unknown): number | { readonly parameterId: string } | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return number(value, 'value');
  const input = object(value, 'parameter value');
  exact(input, ['parameterId'], 'parameter value');
  return { parameterId: id(input.parameterId, 'parameterId') };
}

function constraintType(value: unknown): ConstraintType {
  switch (value) {
    case 'coincident':
    case 'horizontal':
    case 'vertical':
    case 'parallel':
    case 'perpendicular':
    case 'tangent':
    case 'equal':
    case 'concentric':
    case 'fixed':
    case 'distance':
    case 'radius':
    case 'diameter':
      return value;
    default:
      throw new TypeError('constraint.type is unsupported.');
  }
}

function constraint(value: unknown): ConstraintInput {
  const input = object(value, 'constraint');
  exact(input, ['id', 'type', 'refs', 'value', 'temporary'], 'constraint');
  const type = constraintType(input.type);
  const valueProperty = drivingValue(input.value);
  return {
    id: id(input.id, 'constraint.id'),
    type,
    refs: refs(input.refs),
    ...(valueProperty !== undefined ? { value: valueProperty } : {}),
    ...(typeof input.temporary === 'boolean' ? { temporary: input.temporary } : {}),
  };
}

function dimension(value: unknown): DimensionInput {
  const input = object(value, 'dimension');
  exact(input, ['id', 'kind', 'refs', 'value', 'driving', 'label'], 'dimension');
  if (input.kind !== 'distance' && input.kind !== 'radius' && input.kind !== 'diameter') {
    throw new TypeError('dimension.kind is unsupported.');
  }
  const valueProperty = drivingValue(input.value);
  if (valueProperty === undefined) throw new TypeError('dimension.value is required.');
  if (typeof input.driving !== 'boolean') throw new TypeError('dimension.driving is required.');
  return {
    id: id(input.id, 'dimension.id'),
    kind: input.kind,
    refs: refs(input.refs),
    value: valueProperty,
    driving: input.driving,
    ...(typeof input.label === 'string' ? { label: input.label.slice(0, 160) } : {}),
  };
}

function group(value: unknown): GroupInput {
  const input = object(value, 'group');
  exact(input, ['id', 'name', 'entityIds', 'childGroupIds'], 'group');
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new TypeError('group.name is required.');
  }
  return {
    id: id(input.id, 'group.id'),
    name: input.name.slice(0, 160),
    entityIds: stringArray(input.entityIds, 'group.entityIds'),
    ...(input.childGroupIds !== undefined
      ? { childGroupIds: stringArray(input.childGroupIds, 'group.childGroupIds') }
      : {}),
  };
}

function array<T>(value: unknown, name: string, parser: (candidate: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new TypeError(`${name} must contain between 1 and 200 items.`);
  }
  return value.map(parser);
}

export function isSketchCommandType(type: string): type is SketchCommandType {
  return [
    'create_geometry',
    'edit_geometry',
    'move_node',
    'delete_geometry',
    'create_group',
    'move_to_group',
    'apply_constraint',
    'remove_constraint',
    'set_dimension',
  ].includes(type);
}

export function parseSketchCommand(value: Record<string, unknown>): AttuneCommand {
  switch (value.type) {
    case 'create_geometry':
      exact(value, ['type', 'entities', 'groupId'], 'create_geometry command');
      return {
        type: value.type,
        entities: array(value.entities, 'entities', (candidate) => geometry(candidate, false)),
        ...(value.groupId !== undefined ? { groupId: id(value.groupId, 'groupId') } : {}),
      };
    case 'edit_geometry':
      exact(value, ['type', 'entities'], 'edit_geometry command');
      return {
        type: value.type,
        entities: array(value.entities, 'entities', (candidate) => geometry(candidate, true)),
      };
    case 'move_node':
      exact(value, ['type', 'nodeId', 'position'], 'move_node command');
      return {
        type: value.type,
        nodeId: id(value.nodeId, 'nodeId'),
        position: point(value.position, 'position'),
      };
    case 'delete_geometry':
      exact(value, ['type', 'entityIds'], 'delete_geometry command');
      return { type: value.type, entityIds: stringArray(value.entityIds, 'entityIds') };
    case 'create_group':
      exact(value, ['type', 'groups'], 'create_group command');
      return { type: value.type, groups: array(value.groups, 'groups', group) };
    case 'move_to_group':
      exact(value, ['type', 'entityIds', 'groupId'], 'move_to_group command');
      return {
        type: value.type,
        entityIds: stringArray(value.entityIds, 'entityIds'),
        groupId: id(value.groupId, 'groupId'),
      };
    case 'apply_constraint':
      exact(value, ['type', 'constraints'], 'apply_constraint command');
      return { type: value.type, constraints: array(value.constraints, 'constraints', constraint) };
    case 'remove_constraint':
      exact(value, ['type', 'constraintIds'], 'remove_constraint command');
      return { type: value.type, constraintIds: stringArray(value.constraintIds, 'constraintIds') };
    case 'set_dimension':
      exact(value, ['type', 'dimensions'], 'set_dimension command');
      return { type: value.type, dimensions: array(value.dimensions, 'dimensions', dimension) };
    default:
      throw new TypeError('Unsupported semantic sketch command.');
  }
}
