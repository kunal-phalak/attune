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
