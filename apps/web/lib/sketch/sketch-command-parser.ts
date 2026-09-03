import type {
  AttuneCommand,
  ConstraintInput,
  ConstraintType,
  DesignRequestContext,
  DimensionInput,
  GeometryAnchor,
  GeometryInput,
  GeometryPatch,
  GeometryReference,
  GroupInput,
  MechanicalRecipeId,
  RecipeParameterValues,
  SketchCommandType,
  SketchSnapshotInput,
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

function nonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
  return value;
}

function recipeId(value: unknown): MechanicalRecipeId {
  if (
    value === 'round_plate' ||
    value === 'annular_ring' ||
    value === 'rounded_rectangle_plate' ||
    value === 'mounting_plate' ||
    value === 'bolt_circle' ||
    value === 'slotted_plate' ||
    value === 'spoked_wheel' ||
    value === 'radial_pattern'
  ) {
    return value;
  }
  throw new TypeError('recipe must identify a supported mechanical design recipe.');
}

function recipeParameters(value: unknown, name: string): RecipeParameterValues {
  const input = object(value, name);
  const result: Record<string, unknown> = {};
  for (const [key, candidate] of Object.entries(input)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
      throw new TypeError(`${name} contains an invalid parameter name.`);
    }
    if (typeof candidate === 'number') {
      result[key] = number(candidate, `${name}.${key}`);
    } else if (typeof candidate === 'boolean' || typeof candidate === 'string') {
      result[key] = candidate;
    } else {
      result[key] = recipeParameters(candidate, `${name}.${key}`);
    }
  }
  return result;
}

function recipePlacement(value: unknown) {
  const input = object(value, 'placement');
  exact(input, ['center', 'rotationDegrees'], 'placement');
  return {
    center: point(input.center, 'placement.center'),
    ...(input.rotationDegrees !== undefined
      ? { rotationDegrees: number(input.rotationDegrees, 'placement.rotationDegrees') }
      : {}),
  };
}

function conciseText(candidate: unknown, name: string): string {
  if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > 500) {
    throw new TypeError(`${name} must be a concise non-empty string.`);
  }
  return candidate.trim();
}

function designRequest(value: unknown): DesignRequestContext {
  const input = object(value, 'designRequest');
  exact(
    input,
    [
      'purpose',
      'overallEnvelope',
      'criticalDimensions',
      'materialIntent',
      'quantity',
      'manufacturingProcessPreference',
    ],
    'designRequest',
  );
  const envelope =
    input.overallEnvelope === undefined
      ? undefined
      : object(input.overallEnvelope, 'designRequest.overallEnvelope');
  if (envelope) {
    exact(envelope, ['width', 'height', 'diameter', 'thickness'], 'designRequest.overallEnvelope');
  }
  const criticalDimensions = input.criticalDimensions;
  if (criticalDimensions !== undefined && !Array.isArray(criticalDimensions)) {
    throw new TypeError('designRequest.criticalDimensions must be an array.');
  }
  return {
    ...(input.purpose !== undefined
      ? { purpose: conciseText(input.purpose, 'designRequest.purpose') }
      : {}),
    ...(envelope
      ? {
          overallEnvelope: Object.fromEntries(
            Object.entries(envelope).map(([key, candidate]) => [
              key,
              number(candidate, `designRequest.overallEnvelope.${key}`),
            ]),
          ),
        }
      : {}),
    ...(Array.isArray(criticalDimensions)
      ? {
          criticalDimensions: criticalDimensions.map((candidate, index) => {
            const item = object(candidate, `designRequest.criticalDimensions[${index}]`);
            exact(item, ['name', 'value', 'unit'], 'critical dimension');
            if (item.unit !== 'mm' && item.unit !== 'deg' && item.unit !== 'unitless') {
              throw new TypeError('A critical dimension unit must be mm, deg, or unitless.');
            }
            return {
              name: conciseText(item.name, 'critical dimension name'),
              value: number(item.value, 'critical dimension value'),
              unit: item.unit,
            };
          }),
        }
      : {}),
    ...(input.materialIntent !== undefined
      ? { materialIntent: conciseText(input.materialIntent, 'designRequest.materialIntent') }
      : {}),
    ...(input.quantity !== undefined
      ? { quantity: nonNegativeInteger(input.quantity, 'designRequest.quantity') }
      : {}),
    ...(input.manufacturingProcessPreference !== undefined
      ? {
          manufacturingProcessPreference: conciseText(
            input.manufacturingProcessPreference,
            'designRequest.manufacturingProcessPreference',
          ),
        }
      : {}),
  };
}

function versionedTarget(value: unknown, name: string) {
  const input = object(value, name);
  exact(input, ['entityId', 'expectedVersion'], name);
  return {
    entityId: id(input.entityId, `${name}.entityId`),
    expectedVersion: nonNegativeInteger(input.expectedVersion, `${name}.expectedVersion`),
  };
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
  if (kind === 'ellipse') {
    exact(input, [...base, 'center', 'majorRadius', 'minorRadius', 'rotation'], 'ellipse geometry');
    return {
      ...common,
      kind,
      center: point(input.center, 'geometry.center'),
      majorRadius: number(input.majorRadius, 'geometry.majorRadius'),
      minorRadius: number(input.minorRadius, 'geometry.minorRadius'),
      rotation: number(input.rotation, 'geometry.rotation'),
    };
  }
  if (kind === 'bspline') {
    exact(input, [...base, 'degree', 'controlPoints'], 'B-spline geometry');
    if (input.degree !== 3) throw new TypeError('B-spline degree must be 3.');
    if (!Array.isArray(input.controlPoints))
      throw new TypeError('B-spline controlPoints must be an array.');
    return {
      ...common,
      kind,
      degree: 3,
      controlPoints: input.controlPoints.map((candidate, index) =>
        point(candidate, `geometry.controlPoints[${index}]`),
      ),
    };
  }
  throw new TypeError('geometry.kind must be point, line, circle, arc, ellipse, or bspline.');
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
  exact(input, ['id', 'name', 'kind', 'parentGroupId', 'entityIds', 'childGroupIds'], 'group');
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new TypeError('group.name is required.');
  }
  if (input.kind !== undefined && input.kind !== 'group' && input.kind !== 'section') {
    throw new TypeError('group.kind must be group or section.');
  }
  return {
    id: id(input.id, 'group.id'),
    name: input.name.slice(0, 160),
    ...(input.kind === 'group' || input.kind === 'section' ? { kind: input.kind } : {}),
    ...(input.parentGroupId !== undefined
      ? { parentGroupId: id(input.parentGroupId, 'group.parentGroupId') }
      : {}),
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

function optionalArray<T>(
  value: unknown,
  name: string,
  parser: (candidate: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value) || value.length > 2_000) {
    throw new TypeError(`${name} must contain no more than 2000 items.`);
  }
  return value.map(parser);
}

function snapshot(value: unknown): SketchSnapshotInput {
  const input = object(value, 'sketch snapshot');
  exact(
    input,
    ['name', 'entities', 'constraints', 'dimensions', 'groups', 'parameters'],
    'sketch snapshot',
  );
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new TypeError('sketch snapshot.name is required.');
  }
  return {
    name: input.name.trim().slice(0, 160),
    entities: optionalArray(input.entities, 'snapshot.entities', (candidate) =>
      geometry(candidate, false),
    ),
    constraints: optionalArray(input.constraints, 'snapshot.constraints', constraint),
    dimensions: optionalArray(input.dimensions, 'snapshot.dimensions', dimension),
    groups: optionalArray(input.groups, 'snapshot.groups', group),
    parameters: optionalArray(input.parameters, 'snapshot.parameters', (candidate) => {
      const parameter = object(candidate, 'parameter');
      exact(parameter, ['id', 'name', 'value', 'unit'], 'parameter');
      if (
        typeof parameter.name !== 'string' ||
        (parameter.unit !== 'mm' && parameter.unit !== 'deg' && parameter.unit !== 'unitless')
      ) {
        throw new TypeError('parameter.name and parameter.unit are required.');
      }
      return {
        id: id(parameter.id, 'parameter.id'),
        name: parameter.name.slice(0, 160),
        value: number(parameter.value, 'parameter.value'),
        unit: parameter.unit,
      };
    }),
  };
}

export function isSketchCommandType(type: string): type is SketchCommandType {
  return [
    'instantiate_recipe',
    'update_recipe_parameters',
    'set_radius',
    'set_tangent',
    'create_geometry',
    'edit_geometry',
    'move_node',
    'transform_geometry',
    'trim_geometry',
    'delete_geometry',
    'set_construction',
    'create_group',
    'rename_group',
    'move_to_group',
    'apply_constraint',
    'remove_constraint',
    'set_dimension',
    'remove_dimension',
    'restore_sketch',
  ].includes(type);
}

export function parseSketchCommand(value: Record<string, unknown>): AttuneCommand {
  switch (value.type) {
    case 'instantiate_recipe':
      exact(
        value,
        ['type', 'sourceRef', 'recipe', 'parameters', 'placement', 'designRequest'],
        'instantiate_recipe command',
      );
      return {
        type: value.type,
        sourceRef: id(value.sourceRef, 'sourceRef'),
        recipe: recipeId(value.recipe),
        parameters: recipeParameters(value.parameters, 'parameters'),
        ...(value.placement !== undefined ? { placement: recipePlacement(value.placement) } : {}),
        ...(value.designRequest !== undefined
          ? { designRequest: designRequest(value.designRequest) }
          : {}),
      };
    case 'update_recipe_parameters':
      exact(
        value,
        ['type', 'sourceRef', 'expectedVersion', 'changes'],
        'update_recipe_parameters command',
      );
      return {
        type: value.type,
        sourceRef: id(value.sourceRef, 'sourceRef'),
        ...(value.expectedVersion !== undefined
          ? { expectedVersion: nonNegativeInteger(value.expectedVersion, 'expectedVersion') }
          : {}),
        changes: recipeParameters(value.changes, 'changes'),
      };
    case 'set_radius':
      exact(value, ['type', 'target', 'radius'], 'set_radius command');
      return {
        type: value.type,
        target: versionedTarget(value.target, 'target'),
        radius: number(value.radius, 'radius'),
      };
    case 'set_tangent': {
      exact(value, ['type', 'targets', 'constraintId'], 'set_tangent command');
      if (!Array.isArray(value.targets) || value.targets.length !== 2) {
        throw new TypeError('set_tangent.targets must contain exactly two versioned entities.');
      }
      return {
        type: value.type,
        targets: [
          versionedTarget(value.targets[0], 'targets[0]'),
          versionedTarget(value.targets[1], 'targets[1]'),
        ],
        constraintId: id(value.constraintId, 'constraintId'),
      };
    }
    case 'create_geometry':
      exact(
        value,
        ['type', 'entities', 'groupId', 'group', 'constraints'],
        'create_geometry command',
      );
      return {
        type: value.type,
        entities: array(value.entities, 'entities', (candidate) => geometry(candidate, false)),
        ...(value.groupId !== undefined ? { groupId: id(value.groupId, 'groupId') } : {}),
        ...(value.group !== undefined ? { group: group(value.group) } : {}),
        ...(value.constraints !== undefined
          ? { constraints: array(value.constraints, 'constraints', constraint) }
          : {}),
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
    case 'transform_geometry':
      exact(
        value,
        ['type', 'entityIds', 'pivot', 'translation', 'rotation', 'scale'],
        'transform_geometry command',
      );
      return {
        type: value.type,
        entityIds: stringArray(value.entityIds, 'entityIds'),
        pivot: point(value.pivot, 'pivot'),
        ...(value.translation !== undefined
          ? { translation: point(value.translation, 'translation') }
          : {}),
        ...(value.rotation !== undefined ? { rotation: number(value.rotation, 'rotation') } : {}),
        ...(value.scale !== undefined ? { scale: number(value.scale, 'scale') } : {}),
      };
    case 'trim_geometry':
      exact(value, ['type', 'entityId', 'pickPoint'], 'trim_geometry command');
      return {
        type: value.type,
        entityId: id(value.entityId, 'entityId'),
        pickPoint: point(value.pickPoint, 'pickPoint'),
      };
    case 'delete_geometry':
      exact(value, ['type', 'entityIds'], 'delete_geometry command');
      return { type: value.type, entityIds: stringArray(value.entityIds, 'entityIds') };
    case 'set_construction':
      exact(value, ['type', 'entityIds', 'construction'], 'set_construction command');
      if (typeof value.construction !== 'boolean')
        throw new TypeError('construction must be boolean.');
      return {
        type: value.type,
        entityIds: stringArray(value.entityIds, 'entityIds'),
        construction: value.construction,
      };
    case 'create_group':
      exact(value, ['type', 'groups'], 'create_group command');
      return { type: value.type, groups: array(value.groups, 'groups', group) };
    case 'rename_group':
      exact(value, ['type', 'groupId', 'name'], 'rename_group command');
      if (typeof value.name !== 'string' || !value.name.trim()) {
        throw new TypeError('rename_group.name is required.');
      }
      return {
        type: value.type,
        groupId: id(value.groupId, 'groupId'),
        name: value.name.trim().slice(0, 160),
      };
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
    case 'remove_dimension':
      exact(value, ['type', 'dimensionIds'], 'remove_dimension command');
      return { type: value.type, dimensionIds: stringArray(value.dimensionIds, 'dimensionIds') };
    case 'restore_sketch':
      exact(value, ['type', 'snapshot'], 'restore_sketch command');
      return { type: value.type, snapshot: snapshot(value.snapshot) };
    default:
      throw new TypeError('Unsupported semantic sketch command.');
  }
}
