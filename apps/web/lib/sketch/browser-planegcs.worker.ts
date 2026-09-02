import { analyzeDefinitionState, PlaneGcsConstraintSolver } from '@attune/domain/planegcs-core';
import { make_gcs_wrapper } from '@salusoft89/planegcs';

import type { PlaneGcsWorkerRequest, PlaneGcsWorkerResult } from './browser-planegcs-protocol';

const WASM_PATH = '/planegcs.wasm';
let solverPromise: Promise<PlaneGcsConstraintSolver> | undefined;
let work = Promise.resolve();

function solver(): Promise<PlaneGcsConstraintSolver> {
  solverPromise ??= make_gcs_wrapper(WASM_PATH).then((wrapper) =>
    PlaneGcsConstraintSolver.fromWrapper(wrapper),
  );
  return solverPromise;
}

function send(result: PlaneGcsWorkerResult): void {
  self.postMessage(result, { targetOrigin: self.location.origin, transfer: [] });
}

async function handle(request: PlaneGcsWorkerRequest): Promise<void> {
  try {
    const runtime = await solver();
    if (request.type === 'definition') {
      send({
        type: 'definition-result',
        requestId: request.requestId,
        analysis: analyzeDefinitionState(request.document, runtime),
      });
      return;
    }
    const sourceNode = request.nodeId
      ? request.document.nodes.find(({ id }) => id === request.nodeId)
      : undefined;
    const result =
      request.nodeId && request.target
        ? runtime.solve(request.document, [
            { kind: 'node_target', nodeId: request.nodeId, position: request.target },
          ])
        : runtime.solve(request.document);
    const solvedNode = request.nodeId
      ? result.document.nodes.find(({ id }) => id === request.nodeId)
      : undefined;
    const immobile = Boolean(
      request.nodeId &&
      sourceNode &&
      solvedNode &&
      Math.hypot(
        solvedNode.position.x - sourceNode.position.x,
        solvedNode.position.y - sourceNode.position.y,
      ) <= 1e-7,
    );
    send({
      type: 'preview-result',
      dragSessionId: request.dragSessionId,
      generation: request.generation,
      status: result.status,
      document: result.document,
      immobile,
      ...(immobile
        ? { message: 'Geometry is fully constrained by its current relationships.' }
        : {}),
    });
  } catch (error) {
    send({
      type: 'error',
      ...(request.type === 'definition'
        ? { requestId: request.requestId }
        : { dragSessionId: request.dragSessionId, generation: request.generation }),
      message: error instanceof Error ? error.message : 'PlaneGCS preview failed.',
    });
  }
}

self.addEventListener('message', ({ data }: MessageEvent<PlaneGcsWorkerRequest>) => {
  work = work.then(() => handle(data));
});
