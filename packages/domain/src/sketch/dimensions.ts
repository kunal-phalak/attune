import type { ConstraintValue } from './constraints';
import type { GeometryReference } from './geometry';

export type DimensionKind = 'distance' | 'radius' | 'diameter';

export interface SketchDimension {
  readonly id: string;
  readonly version: number;
  readonly kind: DimensionKind;
  readonly refs: readonly GeometryReference[];
  readonly value: ConstraintValue;
  readonly driving: boolean;
  readonly label?: string;
}

export type DimensionInput = Omit<SketchDimension, 'version'>;

export function validateDimensionInput(dimension: DimensionInput): void {
  if (!dimension.id) throw new TypeError('Dimensions require stable IDs.');
  const expected = dimension.kind === 'distance' ? 2 : 1;
  if (dimension.refs.length !== expected) {
    throw new TypeError(`${dimension.id} has the wrong number of geometry references.`);
  }
  if (typeof dimension.value === 'number' && !Number.isFinite(dimension.value)) {
    throw new TypeError(`${dimension.id} has a non-finite value.`);
  }
}
