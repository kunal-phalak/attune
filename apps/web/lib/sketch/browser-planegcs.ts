import { PlaneGcsConstraintSolver } from '@attune/domain/planegcs-core';
import { make_gcs_wrapper } from '@salusoft89/planegcs';

const WASM_PATH = '/planegcs.wasm';
let sharedBrowserSolver: Promise<PlaneGcsConstraintSolver> | undefined;

/** One browser-local WASM process reused for every transient drag projection. */
export function getBrowserPlaneGcsSolver(): Promise<PlaneGcsConstraintSolver> {
  sharedBrowserSolver ??= make_gcs_wrapper(WASM_PATH).then((wrapper) =>
    PlaneGcsConstraintSolver.fromWrapper(wrapper),
  );
  return sharedBrowserSolver;
}
