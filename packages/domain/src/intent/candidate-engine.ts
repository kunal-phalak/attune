import type { ConstraintType } from '../sketch/constraints';
import type { SketchDocument } from '../sketch/document';
import type { GeometryEntity, GeometryReference } from '../sketch/geometry';
import type { SelectionContext } from './selection-context';

function geometryById(document: SketchDocument, id: string): GeometryEntity | undefined {
  return document.entities.find((entity) => entity.id === id);
}

export interface ConstraintCandidate {
  readonly type: ConstraintType;
  readonly refs: readonly GeometryReference[];
  readonly score: number;
  readonly reason: string;
  readonly predictedEffect: string;
}

function candidate(
  type: ConstraintType,
  refs: readonly GeometryReference[],
  score: number,
  reason: string,
  predictedEffect: string,
): ConstraintCandidate {
  return { type, refs, score: Math.round(score * 1000) / 1000, reason, predictedEffect };
}

function existingKey(type: ConstraintType, refs: readonly GeometryReference[]): string {
  return `${type}:${refs
    .map(({ entityId, anchor }) => `${entityId}:${anchor ?? 'self'}`)
    .toSorted()
    .join('|')}`;
}

export function rankConstraintCandidates(
  document: SketchDocument,
  context: SelectionContext,
  snapTolerance = 8,
): readonly ConstraintCandidate[] {
  const ids = [
    ...new Set([
      ...context.selectedEntityIds,
      ...context.nearbyEntities.map(({ entityId }) => entityId),
    ]),
  ];
  const entities = ids.flatMap((id) => {
    const entity = geometryById(document, id);
    return entity ? [entity] : [];
  });
  const existing = new Set(
    document.constraints.map((constraint) => existingKey(constraint.type, constraint.refs)),
  );
  const results: ConstraintCandidate[] = [];

  for (const entity of entities) {
    if (entity.kind !== 'line') continue;
    const dx = entity.end.x - entity.start.x;
    const dy = entity.end.y - entity.start.y;
    const length = Math.hypot(dx, dy);
    const horizontalError = Math.abs(dy) / length;
    const verticalError = Math.abs(dx) / length;
    if (horizontalError <= 0.15) {
      results.push(
        candidate(
          'horizontal',
          [{ entityId: entity.id }],
          0.96 - horizontalError,
          `The line is within ${(horizontalError * 100).toFixed(1)}% of horizontal.`,
          'Removes one rotational degree of freedom and makes both endpoint Y values equal.',
        ),
      );
    }
    if (verticalError <= 0.15) {
      results.push(
        candidate(
          'vertical',
          [{ entityId: entity.id }],
          0.96 - verticalError,
          `The line is within ${(verticalError * 100).toFixed(1)}% of vertical.`,
          'Removes one rotational degree of freedom and makes both endpoint X values equal.',
        ),
      );
    }
  }

  for (let firstIndex = 0; firstIndex < entities.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < entities.length; secondIndex += 1) {
      const first = entities[firstIndex];
      const second = entities[secondIndex];
      if (
        (first.kind === 'circle' || first.kind === 'arc') &&
        (second.kind === 'circle' || second.kind === 'arc')
      ) {
        const centerDistance = Math.hypot(
          first.center.x - second.center.x,
          first.center.y - second.center.y,
        );
        if (centerDistance <= snapTolerance) {
          results.push(
            candidate(
              'concentric',
              [
                { entityId: first.id, anchor: 'center' },
                { entityId: second.id, anchor: 'center' },
              ],
              0.98 - centerDistance / Math.max(1, snapTolerance * 10),
              `Centers are ${centerDistance.toFixed(2)} mm apart.`,
              'Makes both centers coincident while retaining independent radii.',
            ),
          );
        }
        const radiusDifference = Math.abs(first.radius - second.radius);
        if (radiusDifference <= snapTolerance) {
          results.push(
            candidate(
              'equal',
              [{ entityId: first.id }, { entityId: second.id }],
              0.82 - radiusDifference / Math.max(1, snapTolerance * 10),
              `Radii differ by ${radiusDifference.toFixed(2)} mm.`,
              'Makes both radii equal.',
            ),
          );
        }
      }
      if (first.kind === 'line' && second.kind === 'line') {
        const firstAngle = Math.atan2(first.end.y - first.start.y, first.end.x - first.start.x);
        const secondAngle = Math.atan2(
          second.end.y - second.start.y,
          second.end.x - second.start.x,
        );
        const delta = Math.abs(Math.sin(firstAngle - secondAngle));
        if (delta <= 0.12) {
          results.push(
            candidate(
              'parallel',
              [{ entityId: first.id }, { entityId: second.id }],
              0.86 - delta,
              'The line directions are nearly parallel.',
              'Locks the relative line directions while preserving translation.',
            ),
          );
        }
        const perpendicularError = Math.abs(Math.cos(firstAngle - secondAngle));
        if (perpendicularError <= 0.12) {
          results.push(
            candidate(
              'perpendicular',
              [{ entityId: first.id }, { entityId: second.id }],
              0.86 - perpendicularError,
              'The line directions are nearly perpendicular.',
              'Locks the line directions at 90 degrees.',
            ),
          );
        }
      }
    }
  }

  return results
    .filter(({ type, refs }) => !existing.has(existingKey(type, refs)))
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        existingKey(left.type, left.refs).localeCompare(existingKey(right.type, right.refs)),
    );
}
