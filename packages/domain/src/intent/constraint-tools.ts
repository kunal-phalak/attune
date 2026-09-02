import type { ConstraintInput, ConstraintType } from '../sketch/constraints';
import type { DimensionInput, DimensionKind } from '../sketch/dimensions';
import type { SketchDocument } from '../sketch/document';
import {
  geometryAnchorNodeId,
  type GeometryEntity,
  type GeometryReference,
} from '../sketch/geometry';
import type { SelectionSet } from './selection-set';

export type SupportedConstraintTool = Exclude<ConstraintType, 'distance' | 'radius' | 'diameter'>;
export type SupportedDimensionTool = DimensionKind;
export type SupportedSketchRelationTool = SupportedConstraintTool | SupportedDimensionTool;

export interface ConstraintToolApplicability {
  readonly status: 'ready' | 'incomplete' | 'duplicate' | 'unsupported';
  readonly message: string;
  readonly refs?: readonly GeometryReference[];
}

function entityById(document: SketchDocument, id: string): GeometryEntity | undefined {
  return document.entities.find((entity) => entity.id === id);
}

function selectedEntities(
  document: SketchDocument,
  selection: SelectionSet,
): readonly GeometryEntity[] {
  return selection.entityIds.flatMap((id) => {
    const entity = entityById(document, id);
    return entity ? [entity] : [];
  });
}

function referenceForNode(document: SketchDocument, nodeId: string): GeometryReference | undefined {
  for (const entity of document.entities) {
    for (const anchor of ['self', 'start', 'end', 'center'] as const) {
      if (geometryAnchorNodeId(entity, anchor) === nodeId) return { entityId: entity.id, anchor };
    }
  }
  return undefined;
}

function coincidentReferences(
  document: SketchDocument,
  selection: SelectionSet,
): readonly GeometryReference[] {
  const nodeReferences = selection.nodeIds.flatMap((nodeId) => {
    const reference = referenceForNode(document, nodeId);
    return reference ? [reference] : [];
  });
  const entityReferences = selectedEntities(document, selection)
    .filter(({ kind }) => kind === 'point' || kind === 'line')
    .map(({ id }) => ({ entityId: id }));
  return [...nodeReferences, ...entityReferences].filter(
    (reference, index, all) =>
      all.findIndex((candidate) => sameReference(candidate, reference)) === index,
  );
}

function sameReference(left: GeometryReference, right: GeometryReference): boolean {
  return left.entityId === right.entityId && (left.anchor ?? 'self') === (right.anchor ?? 'self');
}

function duplicate(
  document: SketchDocument,
  type: ConstraintType,
  refs: readonly GeometryReference[],
): boolean {
  return document.constraints.some(
    (constraint) =>
      constraint.type === type &&
      constraint.refs.length === refs.length &&
      constraint.refs.every((reference) =>
        refs.some((candidate) => sameReference(reference, candidate)),
      ),
  );
}

function ready(
  document: SketchDocument,
  type: ConstraintType,
  refs: readonly GeometryReference[],
): ConstraintToolApplicability {
  return duplicate(document, type, refs)
    ? { status: 'duplicate', message: `These entities already have a ${type} constraint.` }
    : { status: 'ready', message: `${type} is applicable.`, refs };
}

const COINCIDENT_INSTRUCTION = 'Coincident — choose two points, or a point and a line.';

function coincidentApplicability(
  document: SketchDocument,
  selection: SelectionSet,
): ConstraintToolApplicability {
  const refs = coincidentReferences(document, selection);
  if (refs.length < 2) return { status: 'incomplete', message: COINCIDENT_INSTRUCTION };
  const selectedRefs = refs.slice(0, 2);
  const pointCount = selectedRefs.filter((reference) => {
    const entity = entityById(document, reference.entityId);
    return entity ? Boolean(geometryAnchorNodeId(entity, reference.anchor ?? 'self')) : false;
  }).length;
  const lineCount = selectedRefs.filter((reference) => {
    const entity = entityById(document, reference.entityId);
    return entity?.kind === 'line' && (reference.anchor ?? 'self') === 'self';
  }).length;
  return pointCount === 2 || (pointCount === 1 && lineCount === 1)
    ? ready(document, 'coincident', selectedRefs)
    : { status: 'unsupported', message: COINCIDENT_INSTRUCTION };
}

function binaryEntities(
  document: SketchDocument,
  selection: SelectionSet,
  type: ConstraintType,
  compatible: (first: GeometryEntity, second: GeometryEntity) => boolean,
  instruction: string,
): ConstraintToolApplicability {
  const entities = selectedEntities(document, selection);
  if (entities.length < 2) return { status: 'incomplete', message: instruction };
  const [first, second] = entities;
  if (!compatible(first, second)) return { status: 'unsupported', message: instruction };
  return ready(document, type, [{ entityId: first.id }, { entityId: second.id }]);
}

export function constraintToolApplicability(
  document: SketchDocument,
  selection: SelectionSet,
  type: SupportedConstraintTool,
): ConstraintToolApplicability {
  const entities = selectedEntities(document, selection);
  if (type === 'coincident') return coincidentApplicability(document, selection);
  if (type === 'horizontal' || type === 'vertical') {
    const line = entities[0];
    if (!line || line.kind !== 'line') {
      return {
        status: 'incomplete',
        message: `${type[0].toUpperCase()}${type.slice(1)} — choose a line.`,
      };
    }
    return ready(document, type, [{ entityId: line.id }]);
  }
  if (type === 'fixed') {
    const entity = entities[0];
    return entity
      ? ready(document, type, [{ entityId: entity.id }])
      : { status: 'incomplete', message: 'Fix — choose geometry.' };
  }
  if (type === 'parallel' || type === 'perpendicular') {
    return binaryEntities(
      document,
      selection,
      type,
      (first, second) => first.kind === 'line' && second.kind === 'line',
      `${type[0].toUpperCase()}${type.slice(1)} — choose two lines.`,
    );
  }
  if (type === 'concentric') {
    return binaryEntities(
      document,
      selection,
      type,
      (first, second) =>
        (first.kind === 'circle' || first.kind === 'arc') &&
        (second.kind === 'circle' || second.kind === 'arc'),
      'Concentric — choose two circles or arcs.',
    );
  }
  if (type === 'equal') {
    return binaryEntities(
      document,
      selection,
      type,
      (first, second) =>
        (first.kind === 'line' && second.kind === 'line') ||
        ((first.kind === 'circle' || first.kind === 'arc') &&
          (second.kind === 'circle' || second.kind === 'arc')),
      'Equal — choose two lines, or two circles/arcs.',
    );
  }
  return binaryEntities(
    document,
    selection,
    type,
    (first, second) =>
      ['line', 'circle', 'arc'].includes(first.kind) &&
      ['line', 'circle', 'arc'].includes(second.kind) &&
      !(first.kind === 'line' && second.kind === 'line'),
    'Tangent — choose two compatible curves.',
  );
}

export function constraintInputForTool(
  document: SketchDocument,
  selection: SelectionSet,
  type: SupportedConstraintTool,
  id: string,
): ConstraintInput | null {
  const applicability = constraintToolApplicability(document, selection, type);
  return applicability.status === 'ready' && applicability.refs
    ? { id, type, refs: applicability.refs }
    : null;
}

export function dimensionInputForTool(
  document: SketchDocument,
  selection: SelectionSet,
  kind: SupportedDimensionTool,
  id: string,
  value: number,
): DimensionInput | null {
  const entities = selectedEntities(document, selection);
  const entity = entities[0];
  if (!entity || !Number.isFinite(value) || value <= 0) return null;
  if (kind === 'distance' && entity.kind === 'line') {
    return {
      id,
      kind,
      refs: [
        { entityId: entity.id, anchor: 'start' },
        { entityId: entity.id, anchor: 'end' },
      ],
      value,
      driving: true,
    };
  }
  if (
    (kind === 'radius' || kind === 'diameter') &&
    (entity.kind === 'circle' || entity.kind === 'arc')
  ) {
    return { id, kind, refs: [{ entityId: entity.id }], value, driving: true };
  }
  return null;
}

export function defaultDimensionValue(
  entity: GeometryEntity,
  kind: SupportedDimensionTool,
): number | null {
  if (kind === 'distance' && entity.kind === 'line') {
    return Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y);
  }
  if (
    (kind === 'radius' || kind === 'diameter') &&
    (entity.kind === 'circle' || entity.kind === 'arc')
  ) {
    return kind === 'diameter' ? entity.radius * 2 : entity.radius;
  }
  return null;
}
