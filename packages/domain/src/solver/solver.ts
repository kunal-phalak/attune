import type { SketchDocument, SketchSolveStatus } from '../sketch/document';
import type { SketchPoint2D } from '../sketch/geometry';

export interface SolverDiagnostic {
  readonly code: 'UNSUPPORTED_CONSTRAINT' | 'INVALID_REFERENCE' | 'SOLVER_FAILURE';
  readonly message: string;
  readonly constraintId?: string;
}

export interface ConstraintSolveResult {
  readonly status: SketchSolveStatus;
  readonly document: SketchDocument;
  readonly degreesOfFreedom: number | null;
  readonly conflicts: readonly string[];
  readonly redundant: readonly string[];
  readonly diagnostics: readonly SolverDiagnostic[];
  readonly solvedCoordinates: Readonly<Record<string, SketchPoint2D>>;
}

export interface TemporaryNodeTarget {
  readonly kind: 'node_target';
  readonly nodeId: string;
  readonly position: SketchPoint2D;
}

export interface ConstraintSolver {
  solve(
    document: SketchDocument,
    temporaryConstraints?: readonly TemporaryNodeTarget[],
  ): ConstraintSolveResult;
  dispose(): void;
}
