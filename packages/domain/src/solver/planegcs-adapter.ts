import {
  GcsWrapper,
  SolveStatus,
  make_gcs_wrapper,
  type SketchArc as PlaneArc,
  type SketchCircle as PlaneCircle,
  type SketchParam as PlaneParam,
  type SketchPoint as PlanePoint,
  type SketchPrimitive as PlanePrimitive,
} from '@salusoft89/planegcs';

import { hashCanonical } from '../hash';
import type { ConstraintValue, SketchConstraint } from '../sketch/constraints';
import type { SketchDimension } from '../sketch/dimensions';
import {
  geometryById,
  sketchSpecification,
  type SketchDocument,
  type SketchSolveStatus,
} from '../sketch/document';
import { arcPoint, type GeometryEntity, type GeometryReference } from '../sketch/geometry';
import type { ConstraintSolveResult, ConstraintSolver, SolverDiagnostic } from './solver';

interface Projection {
  readonly primitives: (PlanePrimitive | PlaneParam)[];
  readonly diagnostics: SolverDiagnostic[];
  readonly internalConstraintOwners: ReadonlyMap<string, string>;
}

function internalPointId(reference: GeometryReference, entity: GeometryEntity): string | undefined {
  const anchor = reference.anchor ?? 'self';
  switch (entity.kind) {
    case 'point':
      return anchor === 'self' || anchor === 'center' ? entity.id : undefined;
    case 'line':
      if (anchor === 'start') return `${entity.id}:start`;
      if (anchor === 'end') return `${entity.id}:end`;
      return undefined;
    case 'circle':
    case 'arc':
      if (anchor === 'self' || anchor === 'center') return `${entity.id}:center`;
      if (entity.kind === 'arc' && anchor === 'start') return `${entity.id}:start`;
      if (entity.kind === 'arc' && anchor === 'end') return `${entity.id}:end`;
      return undefined;
  }
  return undefined;
}

function constraintValue(value: ConstraintValue | undefined): number | string | undefined {
  return typeof value === 'object' ? value.parameterId : value;
}

function temporary<T extends PlanePrimitive>(primitive: T, enabled: boolean): T {
  return enabled ? { ...primitive, temporary: true } : primitive;
}

function projectRelation(
  document: SketchDocument,
  source: SketchConstraint | SketchDimension,
  type: SketchConstraint['type'],
  refs: readonly GeometryReference[],
  value: ConstraintValue | undefined,
): PlanePrimitive | undefined {
  const entities = refs.map(({ entityId }) => geometryById(document, entityId));
  if (entities.some((entity) => !entity)) return undefined;
  const first = entities[0]!;
  const second = entities[1];
  const p1 = internalPointId(refs[0], first);
  const p2 = second && refs[1] ? internalPointId(refs[1], second) : undefined;
  const drivingValue = constraintValue(value);
  const withTemporary = <T extends PlanePrimitive>(primitive: T) =>
    temporary(primitive, 'temporary' in source && source.temporary === true);

  switch (type) {
    case 'coincident':
      return p1 && p2
        ? withTemporary({ id: source.id, type: 'p2p_coincident', p1_id: p1, p2_id: p2 })
        : undefined;
    case 'horizontal':
      if (refs.length === 1 && first.kind === 'line') {
        return withTemporary({ id: source.id, type: 'horizontal_l', l_id: first.id });
      }
      return p1 && p2
        ? withTemporary({ id: source.id, type: 'horizontal_pp', p1_id: p1, p2_id: p2 })
        : undefined;
    case 'vertical':
      if (refs.length === 1 && first.kind === 'line') {
        return withTemporary({ id: source.id, type: 'vertical_l', l_id: first.id });
      }
      return p1 && p2
        ? withTemporary({ id: source.id, type: 'vertical_pp', p1_id: p1, p2_id: p2 })
        : undefined;
    case 'parallel':
      return first.kind === 'line' && second?.kind === 'line'
        ? withTemporary({ id: source.id, type: 'parallel', l1_id: first.id, l2_id: second.id })
        : undefined;
    case 'perpendicular':
      return first.kind === 'line' && second?.kind === 'line'
        ? withTemporary({
            id: source.id,
            type: 'perpendicular_ll',
            l1_id: first.id,
            l2_id: second.id,
          })
        : undefined;
    case 'tangent':
      if (first.kind === 'line' && second?.kind === 'circle') {
        return withTemporary({
          id: source.id,
          type: 'tangent_lc',
          l_id: first.id,
          c_id: second.id,
        });
      }
      if (first.kind === 'circle' && second?.kind === 'line') {
        return withTemporary({
          id: source.id,
          type: 'tangent_lc',
          l_id: second.id,
          c_id: first.id,
        });
      }
      if (first.kind === 'line' && second?.kind === 'arc') {
        return withTemporary({
          id: source.id,
          type: 'tangent_la',
          l_id: first.id,
          a_id: second.id,
        });
      }
      if (first.kind === 'arc' && second?.kind === 'line') {
        return withTemporary({
          id: source.id,
          type: 'tangent_la',
          l_id: second.id,
          a_id: first.id,
        });
      }
      if (first.kind === 'circle' && second?.kind === 'circle') {
        return withTemporary({
          id: source.id,
          type: 'tangent_cc',
          c1_id: first.id,
          c2_id: second.id,
        });
      }
      if (first.kind === 'circle' && second?.kind === 'arc') {
        return withTemporary({
          id: source.id,
          type: 'tangent_ca',
          c_id: first.id,
          a_id: second.id,
        });
      }
      if (first.kind === 'arc' && second?.kind === 'circle') {
        return withTemporary({
          id: source.id,
          type: 'tangent_ca',
          c_id: second.id,
          a_id: first.id,
        });
      }
      if (first.kind === 'arc' && second?.kind === 'arc') {
        return withTemporary({
          id: source.id,
          type: 'tangent_aa',
          a1_id: first.id,
          a2_id: second.id,
        });
      }
      return undefined;
    case 'equal':
      if (first.kind === 'line' && second?.kind === 'line') {
        return withTemporary({
          id: source.id,
          type: 'equal_length',
          l1_id: first.id,
          l2_id: second.id,
        });
      }
      if (first.kind === 'circle' && second?.kind === 'circle') {
        return withTemporary({
          id: source.id,
          type: 'equal_radius_cc',
          c1_id: first.id,
          c2_id: second.id,
        });
      }
      if (first.kind === 'circle' && second?.kind === 'arc') {
        return withTemporary({
          id: source.id,
          type: 'equal_radius_ca',
          c1_id: first.id,
          a2_id: second.id,
        });
      }
      if (first.kind === 'arc' && second?.kind === 'circle') {
        return withTemporary({
          id: source.id,
          type: 'equal_radius_ca',
          c1_id: second.id,
          a2_id: first.id,
        });
      }
      if (first.kind === 'arc' && second?.kind === 'arc') {
        return withTemporary({
          id: source.id,
          type: 'equal_radius_aa',
          a1_id: first.id,
          a2_id: second.id,
        });
      }
      return undefined;
    case 'concentric': {
      const center1 = internalPointId({ entityId: first.id, anchor: 'center' }, first);
      const center2 = second
        ? internalPointId({ entityId: second.id, anchor: 'center' }, second)
        : undefined;
      return center1 &&
        center2 &&
        ['circle', 'arc'].includes(first.kind) &&
        ['circle', 'arc'].includes(second!.kind)
        ? withTemporary({ id: source.id, type: 'p2p_coincident', p1_id: center1, p2_id: center2 })
        : undefined;
    }
    case 'distance':
      return p1 && p2 && drivingValue !== undefined
        ? withTemporary({
            id: source.id,
            type: 'p2p_distance',
            p1_id: p1,
            p2_id: p2,
            distance: drivingValue,
          })
        : undefined;
    case 'radius':
      if (drivingValue === undefined) return undefined;
      if (first.kind === 'circle') {
        return withTemporary({
          id: source.id,
          type: 'circle_radius',
          c_id: first.id,
          radius: drivingValue,
        });
      }
      return first.kind === 'arc'
        ? withTemporary({ id: source.id, type: 'arc_radius', a_id: first.id, radius: drivingValue })
        : undefined;
    case 'diameter':
      if (drivingValue === undefined) return undefined;
      if (first.kind === 'circle') {
        return withTemporary({
          id: source.id,
          type: 'circle_diameter',
          c_id: first.id,
          diameter: drivingValue,
        });
      }
      return first.kind === 'arc'
        ? withTemporary({
            id: source.id,
            type: 'arc_diameter',
            a_id: first.id,
            diameter: drivingValue,
          })
        : undefined;
    case 'fixed':
      return undefined;
  }
  return undefined;
}

function geometryPrimitives(
  entity: GeometryEntity,
  fixedPoints: ReadonlySet<string>,
): PlanePrimitive[] {
  const fixedPoint = (id: string, x: number, y: number): PlanePoint => ({
    id,
    type: 'point',
    x,
    y,
    fixed: fixedPoints.has(id),
  });
  switch (entity.kind) {
    case 'point':
      return [fixedPoint(entity.id, entity.position.x, entity.position.y)];
    case 'line':
      return [
        fixedPoint(`${entity.id}:start`, entity.start.x, entity.start.y),
        fixedPoint(`${entity.id}:end`, entity.end.x, entity.end.y),
        { id: entity.id, type: 'line', p1_id: `${entity.id}:start`, p2_id: `${entity.id}:end` },
      ];
    case 'circle':
      return [
        fixedPoint(`${entity.id}:center`, entity.center.x, entity.center.y),
        { id: entity.id, type: 'circle', c_id: `${entity.id}:center`, radius: entity.radius },
      ];
    case 'arc': {
      const start = arcPoint(entity, entity.startAngle);
      const end = arcPoint(entity, entity.endAngle);
      return [
        fixedPoint(`${entity.id}:center`, entity.center.x, entity.center.y),
        fixedPoint(`${entity.id}:start`, start.x, start.y),
        fixedPoint(`${entity.id}:end`, end.x, end.y),
        {
          id: entity.id,
          type: 'arc',
          c_id: `${entity.id}:center`,
          start_id: `${entity.id}:start`,
          end_id: `${entity.id}:end`,
          radius: entity.radius,
          start_angle: entity.startAngle,
          end_angle: entity.endAngle,
        },
        { id: `${entity.id}:arc-rules`, type: 'arc_rules', a_id: entity.id },
      ];
    }
  }
  return [];
}

function fixedPointIds(document: SketchDocument): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const constraint of document.constraints.filter(({ type }) => type === 'fixed')) {
    const reference = constraint.refs[0];
    const entity = reference && geometryById(document, reference.entityId);
    if (!reference || !entity) continue;
    if (entity.kind === 'point') ids.add(entity.id);
    if (entity.kind === 'line') {
      ids.add(`${entity.id}:start`);
      ids.add(`${entity.id}:end`);
    }
    if (entity.kind === 'circle' || entity.kind === 'arc') ids.add(`${entity.id}:center`);
    if (entity.kind === 'arc') {
      ids.add(`${entity.id}:start`);
      ids.add(`${entity.id}:end`);
    }
  }
  return ids;
}

function projectDocument(document: SketchDocument): Projection {
  const diagnostics: SolverDiagnostic[] = [];
  const owners = new Map<string, string>();
  const primitives: (PlanePrimitive | PlaneParam)[] = document.parameters.map((parameter) => ({
    type: 'param',
    name: parameter.id,
    value: parameter.value,
  }));
  const fixedPoints = fixedPointIds(document);
  for (const entity of document.entities)
    primitives.push(...geometryPrimitives(entity, fixedPoints));

  for (const constraint of document.constraints) {
    if (constraint.type === 'fixed') {
      const entity = geometryById(document, constraint.refs[0]?.entityId ?? '');
      if (entity?.kind === 'circle' || entity?.kind === 'arc') {
        const id = `${constraint.id}:fixed-radius`;
        const projected: PlanePrimitive =
          entity.kind === 'circle'
            ? { id, type: 'circle_radius', c_id: entity.id, radius: entity.radius }
            : { id, type: 'arc_radius', a_id: entity.id, radius: entity.radius };
        primitives.push(projected);
        owners.set(id, constraint.id);
      }
      continue;
    }
    const primitive = projectRelation(
      document,
      constraint,
      constraint.type,
      constraint.refs,
      constraint.value,
    );
    if (!primitive) {
      diagnostics.push({
        code: 'UNSUPPORTED_CONSTRAINT',
        constraintId: constraint.id,
        message: `${constraint.type} is not supported for the referenced geometry combination.`,
      });
      continue;
    }
    primitives.push(primitive);
    owners.set(primitive.id, constraint.id);
  }

  for (const dimension of document.dimensions.filter(({ driving }) => driving)) {
    const primitive = projectRelation(
      document,
      dimension,
      dimension.kind,
      dimension.refs,
      dimension.value,
    );
    if (!primitive) {
      diagnostics.push({
        code: 'UNSUPPORTED_CONSTRAINT',
        constraintId: dimension.id,
        message: `${dimension.kind} dimension is not supported for the referenced geometry.`,
      });
      continue;
    }
    primitives.push(primitive);
    owners.set(primitive.id, dimension.id);
  }
  return { primitives, diagnostics, internalConstraintOwners: owners };
}

function solveStatus(status: number): SketchSolveStatus {
  if (status === SolveStatus.Success) return 'success';
  if (status === SolveStatus.Converged) return 'converged';
  if (status === SolveStatus.SuccessfulSolutionInvalid) return 'invalid_solution';
  return 'failed';
}

function ownerIds(ids: readonly string[], owners: ReadonlyMap<string, string>): readonly string[] {
  return [...new Set(ids.map((id) => owners.get(id) ?? id))].toSorted();
}

function planePoint(wrapper: GcsWrapper, id: string): PlanePoint {
  const primitive = wrapper.sketch_index.get_primitive(id);
  if (primitive?.type !== 'point') throw new TypeError(`PlaneGCS point ${id} is unavailable.`);
  return primitive;
}

function planeCircle(wrapper: GcsWrapper, id: string): PlaneCircle {
  const primitive = wrapper.sketch_index.get_primitive(id);
  if (primitive?.type !== 'circle') throw new TypeError(`PlaneGCS circle ${id} is unavailable.`);
  return primitive;
}

function planeArc(wrapper: GcsWrapper, id: string): PlaneArc {
  const primitive = wrapper.sketch_index.get_primitive(id);
  if (primitive?.type !== 'arc') throw new TypeError(`PlaneGCS arc ${id} is unavailable.`);
  return primitive;
}

function solvedDocument(document: SketchDocument, wrapper: GcsWrapper, status: SketchSolveStatus) {
  const entities = document.entities.map((entity): GeometryEntity => {
    switch (entity.kind) {
      case 'point': {
        const point = planePoint(wrapper, entity.id);
        return { ...entity, position: { x: point.x, y: point.y } };
      }
      case 'line': {
        const start = planePoint(wrapper, `${entity.id}:start`);
        const end = planePoint(wrapper, `${entity.id}:end`);
        return { ...entity, start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
      }
      case 'circle': {
        const center = planePoint(wrapper, `${entity.id}:center`);
        const circle = planeCircle(wrapper, entity.id);
        return { ...entity, center: { x: center.x, y: center.y }, radius: circle.radius };
      }
      case 'arc': {
        const center = planePoint(wrapper, `${entity.id}:center`);
        const arc = planeArc(wrapper, entity.id);
        return {
          ...entity,
          center: { x: center.x, y: center.y },
          radius: arc.radius,
          startAngle: arc.start_angle,
          endAngle: arc.end_angle,
        };
      }
    }
    throw new TypeError('Unsupported geometry entity.');
  });
  return {
    ...document,
    entities,
    lastSolve: { status, degreesOfFreedom: null, conflicts: [], redundant: [], diagnostics: [] },
  };
}

export class PlaneGcsConstraintSolver implements ConstraintSolver {
  readonly #cache = new Map<string, ConstraintSolveResult>();

  private constructor(private readonly wrapper: GcsWrapper) {}

  static async create(): Promise<PlaneGcsConstraintSolver> {
    return new PlaneGcsConstraintSolver(await make_gcs_wrapper());
  }

  solve(document: SketchDocument): ConstraintSolveResult {
    const cacheKey = hashCanonical(sketchSpecification(document));
    const cached = this.#cache.get(cacheKey);
    if (cached) return structuredClone(cached);
    const result = this.#solveUncached(document);
    if (this.#cache.size >= 128) this.#cache.delete(this.#cache.keys().next().value ?? '');
    this.#cache.set(cacheKey, structuredClone(result));
    return result;
  }

  #solveUncached(document: SketchDocument): ConstraintSolveResult {
    const projection = projectDocument(document);
    if (projection.diagnostics.length > 0) {
      return {
        status: 'unsupported',
        document: {
          ...structuredClone(document),
          lastSolve: {
            status: 'unsupported',
            degreesOfFreedom: null,
            conflicts: [],
            redundant: [],
            diagnostics: projection.diagnostics.map(({ message }) => message),
          },
        },
        degreesOfFreedom: null,
        conflicts: [],
        redundant: [],
        diagnostics: projection.diagnostics,
        solvedCoordinates: {},
      };
    }

    try {
      this.wrapper.clear_data();
      this.wrapper.push_primitives_and_params(projection.primitives);
      const rawStatus = this.wrapper.solve();
      const status = solveStatus(rawStatus);
      this.wrapper.apply_solution();
      const conflicts = ownerIds(
        this.wrapper.get_gcs_conflicting_constraints(),
        projection.internalConstraintOwners,
      );
      const redundant = ownerIds(
        [
          ...this.wrapper.get_gcs_redundant_constraints(),
          ...this.wrapper.get_gcs_partially_redundant_constraints(),
        ],
        projection.internalConstraintOwners,
      );
      const degreesOfFreedom = this.wrapper.gcs.dof();
      const base = solvedDocument(document, this.wrapper, status);
      const diagnostics: SolverDiagnostic[] = [];
      const resultDocument: SketchDocument = {
        ...base,
        lastSolve: {
          status,
          degreesOfFreedom,
          conflicts,
          redundant,
          diagnostics: [],
        },
      };
      const solvedCoordinates = Object.fromEntries(
        resultDocument.entities.flatMap((entity) => {
          if (entity.kind === 'point') return [[entity.id, entity.position] as const];
          if (entity.kind === 'line') {
            return [
              [`${entity.id}:start`, entity.start] as const,
              [`${entity.id}:end`, entity.end] as const,
            ];
          }
          return [[`${entity.id}:center`, entity.center] as const];
        }),
      );
      return {
        status,
        document: resultDocument,
        degreesOfFreedom,
        conflicts,
        redundant,
        diagnostics,
        solvedCoordinates,
      };
    } catch (error) {
      const diagnostic: SolverDiagnostic = {
        code: 'SOLVER_FAILURE',
        message: error instanceof Error ? error.message : 'PlaneGCS failed without diagnostics.',
      };
      return {
        status: 'failed',
        document: {
          ...structuredClone(document),
          lastSolve: {
            status: 'failed',
            degreesOfFreedom: null,
            conflicts: [],
            redundant: [],
            diagnostics: [diagnostic.message],
          },
        },
        degreesOfFreedom: null,
        conflicts: [],
        redundant: [],
        diagnostics: [diagnostic],
        solvedCoordinates: {},
      };
    }
  }

  dispose(): void {
    this.#cache.clear();
    this.wrapper.destroy_gcs_module();
  }
}

export function createPlaneGcsSolver(): Promise<PlaneGcsConstraintSolver> {
  return PlaneGcsConstraintSolver.create();
}

let sharedPlaneGcsSolver: Promise<PlaneGcsConstraintSolver> | undefined;

export function getPlaneGcsSolver(): Promise<PlaneGcsConstraintSolver> {
  sharedPlaneGcsSolver ??= createPlaneGcsSolver();
  return sharedPlaneGcsSolver;
}
