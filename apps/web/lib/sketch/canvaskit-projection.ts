import {
  positiveArcSweep,
  synchronizeGeometryWithNodes,
  type SketchDocument,
  type SketchPoint2D,
} from '@attune/domain/editor';

export type CanvasSketchPrimitive =
  | { readonly id: string; readonly kind: 'point'; readonly position: SketchPoint2D }
  | {
      readonly id: string;
      readonly kind: 'line';
      readonly start: SketchPoint2D;
      readonly end: SketchPoint2D;
    }
  | {
      readonly id: string;
      readonly kind: 'circle';
      readonly center: SketchPoint2D;
      readonly radius: number;
    }
  | {
      readonly id: string;
      readonly kind: 'arc';
      readonly center: SketchPoint2D;
      readonly radius: number;
      readonly startAngle: number;
      readonly sweepAngle: number;
    };

function unreachable(value: never): never {
  throw new TypeError(`Unsupported geometry kind: ${JSON.stringify(value)}`);
}

/** Pure renderer projection: no Maker.js, PlaneGCS, camera, or CanvasKit object crosses this seam. */
export function projectSketchForCanvas(document: SketchDocument): readonly CanvasSketchPrimitive[] {
  return synchronizeGeometryWithNodes(document.entities, document.nodes ?? []).map((entity) => {
    switch (entity.kind) {
      case 'point':
        return { id: entity.id, kind: entity.kind, position: entity.position };
      case 'line':
        return { id: entity.id, kind: entity.kind, start: entity.start, end: entity.end };
      case 'circle':
        return {
          id: entity.id,
          kind: entity.kind,
          center: entity.center,
          radius: entity.radius,
        };
      case 'arc':
        return {
          id: entity.id,
          kind: entity.kind,
          center: entity.center,
          radius: entity.radius,
          startAngle: entity.startAngle,
          sweepAngle: positiveArcSweep(entity.startAngle, entity.endAngle),
        };
      default:
        return unreachable(entity);
    }
  });
}
