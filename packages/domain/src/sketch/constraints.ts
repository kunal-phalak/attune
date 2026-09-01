import type { GeometryReference } from './geometry';

export type ConstraintType =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  | 'concentric'
  | 'fixed'
  | 'distance'
  | 'radius'
  | 'diameter';

export type ConstraintValue = number | { readonly parameterId: string };

export interface SketchConstraint {
  readonly id: string;
  readonly version: number;
  readonly type: ConstraintType;
  readonly refs: readonly GeometryReference[];
  readonly value?: ConstraintValue;
  readonly temporary?: boolean;
}

export type ConstraintInput = Omit<SketchConstraint, 'version'>;

export function constraintEntityIds(constraint: Pick<SketchConstraint, 'refs'>): readonly string[] {
  return [...new Set(constraint.refs.map(({ entityId }) => entityId))];
}

export function validateConstraintInput(constraint: ConstraintInput): void {
  if (!constraint.id) throw new TypeError('Constraints require stable IDs.');
  const expectedRefs: Readonly<Partial<Record<ConstraintType, readonly number[]>>> = {
    coincident: [2],
    horizontal: [1, 2],
    vertical: [1, 2],
    parallel: [2],
    perpendicular: [2],
    tangent: [2],
    equal: [2],
    concentric: [2],
    fixed: [1],
    distance: [2],
    radius: [1],
    diameter: [1],
  };
  if (!expectedRefs[constraint.type]?.includes(constraint.refs.length)) {
    throw new TypeError(`${constraint.id} has the wrong number of geometry references.`);
  }
  const requiresValue = ['distance', 'radius', 'diameter'].includes(constraint.type);
  if (requiresValue && constraint.value === undefined) {
    throw new TypeError(`${constraint.id} requires a driving value.`);
  }
  if (typeof constraint.value === 'number' && !Number.isFinite(constraint.value)) {
    throw new TypeError(`${constraint.id} has a non-finite value.`);
  }
}
