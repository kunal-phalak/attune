import type {
  GcsWrapper,
  SketchArc as PlaneArc,
  SketchCircle as PlaneCircle,
  SketchParam as PlaneParam,
  SketchPoint as PlanePoint,
  SketchPrimitive as PlanePrimitive,
} from '@salusoft89/planegcs';

import type { ConstraintValue, SketchConstraint } from '../sketch/constraints';
import type { SketchDimension } from '../sketch/dimensions';
import type { SketchDocument, SketchSolveStatus } from '../sketch/document';
import {
  arcPoint,
  geometryAnchorNodeId,
  geometryNodeIds,
  synchronizeArcFromPoints,
  synchronizeGeometryWithNodes,
  type GeometryEntity,
  type GeometryReference,
} from '../sketch/geometry';
import type {
  ConstraintSolveResult,
  ConstraintSolver,
  SolverDiagnostic,
  TemporaryNodeTarget,
} from './solver';

export interface PlaneGcsProjectionMap {
  readonly nodeToPrimitive: Readonly<Record<string, string>>;
  readonly entityToPrimitive: Readonly<Record<string, string>>;
  readonly constraintToPrimitive: Readonly<Record<string, string>>;
}

export interface PlaneGcsProjection {
  readonly primitives: (PlanePrimitive | PlaneParam)[];
  readonly diagnostics: SolverDiagnostic[];
  readonly internalConstraintOwners: ReadonlyMap<string, string>;
  readonly map: PlaneGcsProjectionMap;
}

/** Suppresses sub-micron numerical noise when mapping an otherwise unchanged solve back to Attune. */
export const SOLVER_BACK_PROJECTION_EPSILON_MM = 1e-7;

function geometryById(document: SketchDocument, id: string): GeometryEntity | undefined {
  return document.entities.find((candidate) => candidate.id === id);
}

function nodeById(document: SketchDocument, id: string) {
  return document.nodes.find((candidate) => candidate.id === id);
}

function sketchSpecification(document: SketchDocument): Omit<SketchDocument, 'lastSolve'> {
  const { lastSolve: _lastSolve, ...specification } = document;
  return specification;
}

function internalPointId(reference: GeometryReference, entity: GeometryEntity): string | undefined {
  return geometryAnchorNodeId(entity, reference.anchor ?? 'self');
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

function geometryPrimitive(entity: GeometryEntity): PlanePrimitive | undefined {
  switch (entity.kind) {
    case 'point':
      return undefined;
    case 'line':
      if (!entity.startNodeId || !entity.endNodeId) return undefined;
      return { id: entity.id, type: 'line', p1_id: entity.startNodeId, p2_id: entity.endNodeId };
    case 'circle':
      return entity.centerNodeId
        ? { id: entity.id, type: 'circle', c_id: entity.centerNodeId, radius: entity.radius }
        : undefined;
    case 'arc':
      if (!entity.centerNodeId || !entity.startNodeId || !entity.endNodeId) return undefined;
      return {
        id: entity.id,
        type: 'arc',
        c_id: entity.centerNodeId,
        start_id: entity.startNodeId,
        end_id: entity.endNodeId,
        radius: entity.radius,
        start_angle: entity.startAngle,
        end_angle: entity.endAngle,
      };
    default:
      return undefined;
  }
}

function fixedPointIds(document: SketchDocument): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const constraint of document.constraints.filter(({ type }) => type === 'fixed')) {
    const reference = constraint.refs[0];
    const entity = reference && geometryById(document, reference.entityId);
    if (!reference || !entity) continue;
    geometryNodeIds(entity).forEach((id) => ids.add(id));
  }
  return ids;
}

export function toPlaneGcs(
  source: SketchDocument,
  temporaryConstraints: readonly TemporaryNodeTarget[] = [],
): PlaneGcsProjection {
  const document: SketchDocument = {
    ...source,
    entities: synchronizeGeometryWithNodes(source.entities, source.nodes),
  };
  const diagnostics: SolverDiagnostic[] = [];
  const owners = new Map<string, string>();
  const primitives: (PlanePrimitive | PlaneParam)[] = document.parameters.map((parameter) => ({
    type: 'param',
    name: parameter.id,
    value: parameter.value,
  }));
  const fixedPoints = fixedPointIds(document);
  const nodeToPrimitive: Record<string, string> = {};
  const entityToPrimitive: Record<string, string> = {};
  const constraintToPrimitive: Record<string, string> = {};
  for (const node of document.nodes) {
    nodeToPrimitive[node.id] = node.id;
    primitives.push({
      id: node.id,
      type: 'point',
      x: node.position.x,
      y: node.position.y,
      fixed: fixedPoints.has(node.id),
    });
  }
  for (const entity of document.entities) {
    const primitive = geometryPrimitive(entity);
    if (primitive) {
      primitives.push(primitive);
      entityToPrimitive[entity.id] = primitive.id;
      if (entity.kind === 'arc') {
        const arcRulesId = `${entity.id}:arc-rules`;
        primitives.push({ id: arcRulesId, type: 'arc_rules', a_id: entity.id });
        owners.set(arcRulesId, entity.id);
      }
    } else if (entity.kind === 'point' && entity.nodeId) {
      entityToPrimitive[entity.id] = entity.nodeId;
    } else {
      diagnostics.push({
        code: 'INVALID_REFERENCE',
        message: `${entity.id} is missing canonical topology node references.`,
      });
    }
  }

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
        constraintToPrimitive[constraint.id] = id;
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
    constraintToPrimitive[constraint.id] = primitive.id;
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
    constraintToPrimitive[dimension.id] = primitive.id;
  }
  for (const target of [...temporaryConstraints].toSorted((left, right) =>
    left.nodeId.localeCompare(right.nodeId),
  )) {
    if (!nodeById(document, target.nodeId)) {
      diagnostics.push({
        code: 'INVALID_REFERENCE',
        message: `Temporary driver references unknown node ${target.nodeId}.`,
      });
      continue;
    }
    primitives.push(
      {
        id: `temporary:${target.nodeId}:x`,
        type: 'coordinate_x',
        p_id: target.nodeId,
        x: target.position.x,
        temporary: true,
      },
      {
        id: `temporary:${target.nodeId}:y`,
        type: 'coordinate_y',
        p_id: target.nodeId,
        y: target.position.y,
        temporary: true,
      },
    );
  }
  return {
    primitives,
    diagnostics,
    internalConstraintOwners: owners,
    map: { nodeToPrimitive, entityToPrimitive, constraintToPrimitive },
  };
}

function solveStatus(status: number): SketchSolveStatus {
  if (status === 0) return 'success';
  if (status === 1) return 'converged';
  if (status === 3) return 'invalid_solution';
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
  const nodes = (document.nodes ?? []).map((node) => {
    const solved = planePoint(wrapper, node.id);
    const movement = Math.hypot(solved.x - node.position.x, solved.y - node.position.y);
    return movement <= SOLVER_BACK_PROJECTION_EPSILON_MM
      ? node
      : Object.assign({}, node, { position: { x: solved.x, y: solved.y } });
  });
  const nodePositions = new Map(nodes.map((node) => [node.id, node.position]));
  const position = (id: string | undefined, fallback: { readonly x: number; readonly y: number }) =>
    (id ? nodePositions.get(id) : undefined) ?? fallback;
  const entities = document.entities.map((entity): GeometryEntity => {
    switch (entity.kind) {
      case 'point':
        return { ...entity, position: position(entity.nodeId, entity.position) };
      case 'line':
        return {
          ...entity,
          start: position(entity.startNodeId, entity.start),
          end: position(entity.endNodeId, entity.end),
        };
      case 'circle': {
        const circle = planeCircle(wrapper, entity.id);
        return {
          ...entity,
          center: position(entity.centerNodeId, entity.center),
          radius:
            Math.abs(circle.radius - entity.radius) <= SOLVER_BACK_PROJECTION_EPSILON_MM
              ? entity.radius
              : circle.radius,
        };
      }
      case 'arc': {
        const arc = planeArc(wrapper, entity.id);
        const center = position(entity.centerNodeId, entity.center);
        const start = position(entity.startNodeId, arcPoint(entity, entity.startAngle));
        const end = position(entity.endNodeId, arcPoint(entity, entity.endAngle));
        if (
          center === entity.center &&
          Math.hypot(
            start.x - arcPoint(entity, entity.startAngle).x,
            start.y - arcPoint(entity, entity.startAngle).y,
          ) <= SOLVER_BACK_PROJECTION_EPSILON_MM &&
          Math.hypot(
            end.x - arcPoint(entity, entity.endAngle).x,
            end.y - arcPoint(entity, entity.endAngle).y,
          ) <= SOLVER_BACK_PROJECTION_EPSILON_MM &&
          Math.abs(arc.radius - entity.radius) <= SOLVER_BACK_PROJECTION_EPSILON_MM
        ) {
          return entity;
        }
        return synchronizeArcFromPoints(entity, center, start, end, arc.radius);
      }
    }
    throw new TypeError('Unsupported geometry entity.');
  });
  return {
    ...document,
    nodes,
    entities,
    lastSolve: { status, degreesOfFreedom: null, conflicts: [], redundant: [], diagnostics: [] },
  };
}

export class PlaneGcsConstraintSolver implements ConstraintSolver {
  readonly #cache = new Map<string, ConstraintSolveResult>();

  private constructor(private readonly wrapper: GcsWrapper) {}

  static fromWrapper(wrapper: GcsWrapper): PlaneGcsConstraintSolver {
    return new PlaneGcsConstraintSolver(wrapper);
  }

  solve(
    document: SketchDocument,
    temporaryConstraints: readonly TemporaryNodeTarget[] = [],
  ): ConstraintSolveResult {
    if (temporaryConstraints.length > 0) {
      return this.#solveUncached(document, temporaryConstraints);
    }
    // Runtime-local memoization only. Authoritative SHA hashing remains a server boundary.
    const cacheKey = JSON.stringify(sketchSpecification(document));
    const cached = this.#cache.get(cacheKey);
    if (cached) return structuredClone(cached);
    const result = this.#solveUncached(document, []);
    if (this.#cache.size >= 128) this.#cache.delete(this.#cache.keys().next().value ?? '');
    this.#cache.set(cacheKey, structuredClone(result));
    return result;
  }

  #solveUncached(
    source: SketchDocument,
    temporaryConstraints: readonly TemporaryNodeTarget[],
  ): ConstraintSolveResult {
    const document: SketchDocument = {
      ...source,
      entities: synchronizeGeometryWithNodes(source.entities, source.nodes),
    };
    const projection = toPlaneGcs(document, temporaryConstraints);
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
        resultDocument.nodes.map((node) => [node.id, node.position] as const),
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
