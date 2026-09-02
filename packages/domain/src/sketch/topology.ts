import { hashCanonical } from '../hash';
import {
  arcPoint,
  geometryNodeIds,
  synchronizeGeometryWithNodes,
  type GeometryEntity,
  type MakerPathSourceRef,
  type SketchNode,
  type SketchNodeSourceRef,
  type SketchPoint2D,
} from './geometry';

/** World-space equivalence for authored millimetre topology; never use for hit testing or snapping. */
export const TOPOLOGY_EPSILON_MM = 1e-7;

export interface TopologyCandidate {
  readonly token: string;
  readonly position: SketchPoint2D;
  readonly sourceRef?: MakerPathSourceRef;
  readonly anchor: SketchNodeSourceRef['anchor'];
}

export interface InternedTopology {
  readonly nodes: readonly SketchNode[];
  readonly nodeIdByToken: ReadonlyMap<string, string>;
}

function finitePoint(point: SketchPoint2D): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function sourceRefKey(sourceRef: SketchNodeSourceRef): string {
  return `${sourceRef.routeKey}:${sourceRef.anchor}`;
}

function bucketKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function unreachable(value: never): never {
  throw new TypeError(`Unsupported geometry kind: ${JSON.stringify(value)}`);
}

function createUnionFind(size: number) {
  const parents = Array.from({ length: size }, (_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root]!;
    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }
    return root;
  };
  const union = (first: number, second: number) => {
    const left = find(first);
    const right = find(second);
    if (left !== right) parents[Math.max(left, right)] = Math.min(left, right);
  };
  return { find, union };
}

function neighboringIndices(
  buckets: ReadonlyMap<string, readonly number[]>,
  x: number,
  y: number,
): readonly number[] {
  const indices: number[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      indices.push(...(buckets.get(bucketKey(x + dx, y + dy)) ?? []));
    }
  }
  return indices;
}

function nodeFromContributors(
  contributors: readonly TopologyCandidate[],
  nodeIdByToken: Map<string, string>,
): SketchNode {
  const id = `sketch:node:${hashCanonical(contributors.map(({ token }) => token)).slice(0, 20)}`;
  for (const contributor of contributors) nodeIdByToken.set(contributor.token, id);
  const sourceRefs = contributors
    .flatMap(({ sourceRef, anchor }) =>
      sourceRef ? [Object.assign({}, sourceRef, { anchor })] : [],
    )
    .filter(
      (sourceRef, index, refs) =>
        refs.findIndex((candidate) => sourceRefKey(candidate) === sourceRefKey(sourceRef)) ===
        index,
    )
    .toSorted((left, right) => sourceRefKey(left).localeCompare(sourceRefKey(right)));
  const node: SketchNode = { id, version: 1, position: contributors[0].position };
  return sourceRefs.length > 0 ? Object.assign({}, node, { sourceRefs }) : node;
}

export function internTopologyCandidates(
  input: readonly TopologyCandidate[],
  epsilon = TOPOLOGY_EPSILON_MM,
): InternedTopology {
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw new TypeError('Invalid topology epsilon.');
  const candidates = [...input].toSorted((left, right) => left.token.localeCompare(right.token));
  if (new Set(candidates.map(({ token }) => token)).size !== candidates.length) {
    throw new TypeError('Topology candidate tokens must be unique.');
  }
  if (candidates.some(({ position }) => !finitePoint(position))) {
    throw new TypeError('Topology candidates require finite world coordinates.');
  }

  const { find, union } = createUnionFind(candidates.length);
  const buckets = new Map<string, number[]>();
  const cell = (value: number) => Math.floor(value / epsilon);

  for (const [index, candidate] of candidates.entries()) {
    const x = cell(candidate.position.x);
    const y = cell(candidate.position.y);
    for (const otherIndex of neighboringIndices(buckets, x, y)) {
      const other = candidates[otherIndex];
      if (
        Math.hypot(
          candidate.position.x - other.position.x,
          candidate.position.y - other.position.y,
        ) <= epsilon
      ) {
        union(index, otherIndex);
      }
    }
    const key = bucketKey(x, y);
    buckets.set(key, [...(buckets.get(key) ?? []), index]);
  }

  const clusters = new Map<number, number[]>();
  for (const index of candidates.keys()) {
    const root = find(index);
    clusters.set(root, [...(clusters.get(root) ?? []), index]);
  }
  const nodeIdByToken = new Map<string, string>();
  const nodes = [...clusters.values()].map((indices) =>
    nodeFromContributors(
      indices
        .map((index) => candidates[index])
        .toSorted((left, right) => left.token.localeCompare(right.token)),
      nodeIdByToken,
    ),
  );
  return { nodes: nodes.toSorted((left, right) => left.id.localeCompare(right.id)), nodeIdByToken };
}

function candidateToken(entityId: string, anchor: TopologyCandidate['anchor']): string {
  return `geometry:${entityId}:${anchor}`;
}

export function topologyCandidatesForGeometry(
  entities: readonly GeometryEntity[],
): readonly TopologyCandidate[] {
  return entities.flatMap((entity): readonly TopologyCandidate[] => {
    const candidate = (anchor: TopologyCandidate['anchor'], position: SketchPoint2D) => ({
      token: candidateToken(entity.id, anchor),
      position,
      ...(entity.sourceRef ? { sourceRef: entity.sourceRef } : {}),
      anchor,
    });
    switch (entity.kind) {
      case 'point':
        return [candidate('self', entity.position)];
      case 'line':
        return [candidate('start', entity.start), candidate('end', entity.end)];
      case 'circle':
        return [candidate('center', entity.center)];
      case 'arc':
        return [
          candidate('center', entity.center),
          candidate('start', arcPoint(entity, entity.startAngle)),
          candidate('end', arcPoint(entity, entity.endAngle)),
        ];
      default:
        return unreachable(entity);
    }
  });
}

export function ensureGeometryTopology(
  entities: readonly GeometryEntity[],
  existingNodes: readonly SketchNode[] = [],
): { readonly entities: readonly GeometryEntity[]; readonly nodes: readonly SketchNode[] } {
  if (existingNodes.length > 0 && entities.every((entity) => geometryNodeIds(entity).length > 0)) {
    return {
      entities: synchronizeGeometryWithNodes(entities, existingNodes),
      nodes: existingNodes,
    };
  }
  const candidates = topologyCandidatesForGeometry(entities);
  const topology = internTopologyCandidates(candidates);
  const withReferences = entities.map((entity): GeometryEntity => {
    const nodeId = (anchor: TopologyCandidate['anchor']) =>
      topology.nodeIdByToken.get(candidateToken(entity.id, anchor));
    switch (entity.kind) {
      case 'point':
        return { ...entity, nodeId: nodeId('self') };
      case 'line':
        return { ...entity, startNodeId: nodeId('start'), endNodeId: nodeId('end') };
      case 'circle':
        return { ...entity, centerNodeId: nodeId('center') };
      case 'arc':
        return {
          ...entity,
          centerNodeId: nodeId('center'),
          startNodeId: nodeId('start'),
          endNodeId: nodeId('end'),
        };
      default:
        return unreachable(entity);
    }
  });
  return {
    entities: synchronizeGeometryWithNodes(withReferences, topology.nodes),
    nodes: topology.nodes,
  };
}

export function incidentEntityIds(
  entities: readonly GeometryEntity[],
  nodeId: string,
): readonly string[] {
  return entities
    .filter((entity) => geometryNodeIds(entity).includes(nodeId))
    .map(({ id }) => id)
    .toSorted();
}
