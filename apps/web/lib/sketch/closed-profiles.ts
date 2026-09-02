import {
  ellipsePoint,
  type LineEntity,
  type SketchDocument,
  type SketchPoint2D,
} from '@attune/domain/editor';

export interface ClosedProfileContour {
  readonly id: string;
  readonly entityIds: readonly string[];
  readonly points: readonly SketchPoint2D[];
}

/** Lightweight exact-topology loop detection; it deliberately stops short of a face/boolean kernel. */
export function closedProfileContours(document: SketchDocument): readonly ClosedProfileContour[] {
  const contours: ClosedProfileContour[] = [];
  for (const entity of document.entities) {
    if (entity.construction) continue;
    if (entity.kind === 'circle') {
      contours.push({
        id: `profile:${entity.id}`,
        entityIds: [entity.id],
        points: Array.from({ length: 96 }, (_, index) => ({
          x: entity.center.x + Math.cos((index / 96) * Math.PI * 2) * entity.radius,
          y: entity.center.y + Math.sin((index / 96) * Math.PI * 2) * entity.radius,
        })),
      });
    } else if (entity.kind === 'ellipse') {
      contours.push({
        id: `profile:${entity.id}`,
        entityIds: [entity.id],
        points: Array.from({ length: 96 }, (_, index) =>
          ellipsePoint(entity, (index / 96) * Math.PI * 2),
        ),
      });
    }
  }

  const lines = document.entities.filter(
    (entity): entity is LineEntity =>
      entity.kind === 'line' &&
      !entity.construction &&
      Boolean(entity.startNodeId) &&
      Boolean(entity.endNodeId),
  );
  const byNode = new Map<string, typeof lines>();
  for (const line of lines) {
    if (line.kind !== 'line') continue;
    for (const nodeId of [line.startNodeId!, line.endNodeId!]) {
      byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), line]);
    }
  }
  const visited = new Set<string>();
  for (const seed of lines) {
    if (seed.kind !== 'line' || visited.has(seed.id)) continue;
    const component: typeof lines = [];
    const queue = [seed];
    while (queue.length > 0) {
      const line = queue.pop()!;
      if (visited.has(line.id)) continue;
      visited.add(line.id);
      component.push(line);
      if (line.kind !== 'line') continue;
      for (const nodeId of [line.startNodeId!, line.endNodeId!]) {
        for (const neighbor of byNode.get(nodeId) ?? []) {
          if (!visited.has(neighbor.id)) queue.push(neighbor);
        }
      }
    }
    const componentIds = new Set(component.map(({ id }) => id));
    const componentNodes = [...byNode]
      .filter(([, incident]) => incident.some(({ id }) => componentIds.has(id)))
      .map(([nodeId, incident]) => ({
        nodeId,
        degree: incident.filter(({ id }) => componentIds.has(id)).length,
      }));
    if (component.length < 3 || componentNodes.some(({ degree }) => degree !== 2)) continue;
    const ordered: SketchPoint2D[] = [];
    let current = component[0];
    let nodeId = current.kind === 'line' ? current.startNodeId! : '';
    const startNodeId = nodeId;
    const orderedIds: string[] = [];
    for (let guard = 0; guard <= component.length; guard += 1) {
      if (current.kind !== 'line') break;
      orderedIds.push(current.id);
      const atStart = current.startNodeId === nodeId;
      ordered.push(atStart ? current.start : current.end);
      const nextNodeId = atStart ? current.endNodeId! : current.startNodeId!;
      if (nextNodeId === startNodeId) break;
      const next = (byNode.get(nextNodeId) ?? []).find(
        ({ id }) => componentIds.has(id) && !orderedIds.includes(id),
      );
      if (!next) break;
      nodeId = nextNodeId;
      current = next;
    }
    if (orderedIds.length === component.length) {
      contours.push({
        id: `profile:${orderedIds.toSorted().join('|')}`,
        entityIds: orderedIds.toSorted(),
        points: ordered,
      });
    }
  }
  return contours;
}
