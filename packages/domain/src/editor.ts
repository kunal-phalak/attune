/** Browser-safe editor geometry surface. Keep topology interning and authoritative hashing out. */
export * from './intent/selection-context';
export * from './intent/candidate-engine';
export * from './intent/curve-proximity';
export * from './intent/marquee';
export * from './intent/selection-set';
export * from './intent/snap';
export * from './sketch/geometry';
export * from './sketch/primitives';
export { geometryIntersections, trimSegmentAtPoint } from './sketch/trim';
export { moveSketchNode } from './sketch/document';
export type { SketchDocument, SketchSolveSnapshot } from './sketch/document';
export type { SketchConstraint } from './sketch/constraints';
