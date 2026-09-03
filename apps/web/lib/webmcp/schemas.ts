export const POINT_SCHEMA = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y'],
  additionalProperties: false,
} as const;

export const REFERENCE_SCHEMA = {
  type: 'object',
  properties: {
    entityId: { type: 'string', description: 'Stable public Attune entity reference.' },
    anchor: { type: 'string', enum: ['self', 'start', 'end', 'center'] },
  },
  required: ['entityId'],
  additionalProperties: false,
} as const;

export const GEOMETRY_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { const: 'point' },
        name: { type: 'string' },
        construction: { type: 'boolean' },
        position: POINT_SCHEMA,
      },
      required: ['id', 'kind', 'position'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { const: 'ellipse' },
        name: { type: 'string' },
        construction: { type: 'boolean' },
        center: POINT_SCHEMA,
        majorRadius: { type: 'number', exclusiveMinimum: 0 },
        minorRadius: { type: 'number', exclusiveMinimum: 0 },
        rotation: { type: 'number' },
      },
      required: ['id', 'kind', 'center', 'majorRadius', 'minorRadius', 'rotation'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { const: 'bspline' },
        name: { type: 'string' },
        construction: { type: 'boolean' },
        degree: { const: 3 },
        controlPoints: { type: 'array', minItems: 4, maxItems: 200, items: POINT_SCHEMA },
      },
      required: ['id', 'kind', 'degree', 'controlPoints'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { const: 'line' },
        name: { type: 'string' },
        construction: { type: 'boolean' },
        start: POINT_SCHEMA,
        end: POINT_SCHEMA,
      },
      required: ['id', 'kind', 'start', 'end'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { const: 'circle' },
        name: { type: 'string' },
        construction: { type: 'boolean' },
        center: POINT_SCHEMA,
        radius: { type: 'number', exclusiveMinimum: 0 },
      },
      required: ['id', 'kind', 'center', 'radius'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { const: 'arc' },
        name: { type: 'string' },
        construction: { type: 'boolean' },
        center: POINT_SCHEMA,
        radius: { type: 'number', exclusiveMinimum: 0 },
        startAngle: { type: 'number' },
        endAngle: { type: 'number' },
      },
      required: ['id', 'kind', 'center', 'radius', 'startAngle', 'endAngle'],
      additionalProperties: false,
    },
  ],
} as const;

export const GROUP_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    kind: { type: 'string', enum: ['group', 'section'] },
    parentGroupId: { type: 'string' },
    entityIds: { type: 'array', items: { type: 'string' } },
    childGroupIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'name', 'entityIds'],
  additionalProperties: false,
} as const;

export const CONSTRAINT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: {
      type: 'string',
      enum: [
        'coincident',
        'horizontal',
        'vertical',
        'parallel',
        'perpendicular',
        'tangent',
        'equal',
        'concentric',
        'fixed',
        'distance',
        'radius',
        'diameter',
      ],
    },
    refs: { type: 'array', minItems: 1, maxItems: 2, items: REFERENCE_SCHEMA },
    value: { type: 'number' },
    temporary: { type: 'boolean' },
  },
  required: ['id', 'type', 'refs'],
  additionalProperties: false,
} as const;

export const DIMENSION_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ['distance', 'radius', 'diameter'] },
    refs: { type: 'array', minItems: 1, maxItems: 2, items: REFERENCE_SCHEMA },
    value: { type: 'number' },
    driving: { type: 'boolean' },
    label: { type: 'string' },
  },
  required: ['id', 'kind', 'refs', 'value', 'driving'],
  additionalProperties: false,
} as const;

const POSITIVE_NUMBER_SCHEMA = { type: 'number', exclusiveMinimum: 0 } as const;

const HOLE_PATTERN_SCHEMA = {
  type: 'object',
  properties: {
    pitchCircleDiameter: POSITIVE_NUMBER_SCHEMA,
    holeDiameter: POSITIVE_NUMBER_SCHEMA,
    count: { type: 'integer', minimum: 2, maximum: 64 },
    rotation: { type: 'number', default: 0 },
  },
  required: ['pitchCircleDiameter', 'holeDiameter', 'count'],
  additionalProperties: false,
} as const;

export const RECIPE_PARAMETERS_SCHEMA = {
  oneOf: [
    {
      title: 'round_plate parameters',
      type: 'object',
      properties: {
        outerDiameter: POSITIVE_NUMBER_SCHEMA,
        centerBoreDiameter: POSITIVE_NUMBER_SCHEMA,
        holePattern: HOLE_PATTERN_SCHEMA,
      },
      required: ['outerDiameter'],
      additionalProperties: false,
    },
    {
      title: 'annular_ring parameters',
      type: 'object',
      properties: {
        outerDiameter: POSITIVE_NUMBER_SCHEMA,
        innerDiameter: POSITIVE_NUMBER_SCHEMA,
      },
      required: ['outerDiameter', 'innerDiameter'],
      additionalProperties: false,
    },
    {
      title: 'rounded_rectangle_plate parameters',
      type: 'object',
      properties: {
        width: POSITIVE_NUMBER_SCHEMA,
        height: POSITIVE_NUMBER_SCHEMA,
        cornerRadius: { type: 'number', minimum: 0 },
      },
      required: ['width', 'height', 'cornerRadius'],
      additionalProperties: false,
    },
    {
      title: 'mounting_plate parameters',
      type: 'object',
      properties: {
        width: POSITIVE_NUMBER_SCHEMA,
        height: POSITIVE_NUMBER_SCHEMA,
        cornerRadius: { type: 'number', minimum: 0 },
        holeDiameter: POSITIVE_NUMBER_SCHEMA,
        holeSpacingX: POSITIVE_NUMBER_SCHEMA,
        holeSpacingY: POSITIVE_NUMBER_SCHEMA,
        centerBoreDiameter: POSITIVE_NUMBER_SCHEMA,
      },
      required: ['width', 'height', 'cornerRadius', 'holeDiameter', 'holeSpacingX', 'holeSpacingY'],
      additionalProperties: false,
    },
    {
      title: 'bolt_circle parameters',
      type: 'object',
      properties: {
        pitchCircleDiameter: POSITIVE_NUMBER_SCHEMA,
        holeDiameter: POSITIVE_NUMBER_SCHEMA,
        count: { type: 'integer', minimum: 2, maximum: 64 },
        rotation: { type: 'number', default: 0 },
      },
      required: ['pitchCircleDiameter', 'holeDiameter', 'count'],
      additionalProperties: false,
    },
    {
      title: 'slotted_plate parameters',
      type: 'object',
      properties: {
        width: POSITIVE_NUMBER_SCHEMA,
        height: POSITIVE_NUMBER_SCHEMA,
        cornerRadius: { type: 'number', minimum: 0 },
        slotLength: POSITIVE_NUMBER_SCHEMA,
        slotWidth: POSITIVE_NUMBER_SCHEMA,
      },
      required: ['width', 'height', 'cornerRadius', 'slotLength', 'slotWidth'],
      additionalProperties: false,
    },
    {
      title: 'spoked_wheel parameters',
      type: 'object',
      properties: {
        spokeCount: { type: 'integer', minimum: 2, maximum: 64 },
        outerDiameter: POSITIVE_NUMBER_SCHEMA,
        centerBoreDiameter: POSITIVE_NUMBER_SCHEMA,
        hubDiameter: POSITIVE_NUMBER_SCHEMA,
        spokeWidth: POSITIVE_NUMBER_SCHEMA,
        innerFillet: POSITIVE_NUMBER_SCHEMA,
        outerFillet: POSITIVE_NUMBER_SCHEMA,
      },
      required: ['spokeCount'],
      additionalProperties: false,
    },
    {
      title: 'radial_pattern parameters',
      type: 'object',
      properties: {
        pitchCircleDiameter: POSITIVE_NUMBER_SCHEMA,
        featureDiameter: POSITIVE_NUMBER_SCHEMA,
        count: { type: 'integer', minimum: 2, maximum: 64 },
        rotation: { type: 'number', default: 0 },
      },
      required: ['pitchCircleDiameter', 'featureDiameter', 'count'],
      additionalProperties: false,
    },
  ],
} as const;

export const RECIPE_PLACEMENT_SCHEMA = {
  type: 'object',
  properties: {
    center: POINT_SCHEMA,
    rotationDegrees: { type: 'number', default: 0 },
  },
  required: ['center'],
  additionalProperties: false,
} as const;

export const DESIGN_REQUEST_SCHEMA = {
  type: 'object',
  description:
    'Optional request context; retained as design intent and never converted to sketch topology.',
  properties: {
    purpose: { type: 'string', minLength: 1, maxLength: 500 },
    overallEnvelope: {
      type: 'object',
      properties: {
        width: { type: 'number' },
        height: { type: 'number' },
        diameter: { type: 'number' },
        thickness: { type: 'number' },
      },
      additionalProperties: false,
    },
    criticalDimensions: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 160 },
          value: { type: 'number' },
          unit: { type: 'string', enum: ['mm', 'deg', 'unitless'] },
        },
        required: ['name', 'value', 'unit'],
        additionalProperties: false,
      },
    },
    materialIntent: { type: 'string', minLength: 1, maxLength: 500 },
    quantity: { type: 'integer', minimum: 0 },
    manufacturingProcessPreference: { type: 'string', minLength: 1, maxLength: 500 },
  },
  additionalProperties: false,
} as const;

export const VERSIONED_TARGET_SCHEMA = {
  type: 'object',
  properties: {
    entityId: { type: 'string' },
    expectedVersion: { type: 'integer', minimum: 0 },
  },
  required: ['entityId', 'expectedVersion'],
  additionalProperties: false,
} as const;
