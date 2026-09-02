import { make_gcs_wrapper } from '@salusoft89/planegcs';

import { PlaneGcsConstraintSolver } from './planegcs-adapter';

export * from './planegcs-adapter';

export async function createPlaneGcsSolver(wasmPath?: string): Promise<PlaneGcsConstraintSolver> {
  return PlaneGcsConstraintSolver.fromWrapper(await make_gcs_wrapper(wasmPath));
}

let sharedPlaneGcsSolver: Promise<PlaneGcsConstraintSolver> | undefined;

export function getPlaneGcsSolver(): Promise<PlaneGcsConstraintSolver> {
  sharedPlaneGcsSolver ??= createPlaneGcsSolver();
  return sharedPlaneGcsSolver;
}
