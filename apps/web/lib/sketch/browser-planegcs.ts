import type { DefinitionStateAnalysis, SketchDocument, SketchPoint2D } from '@attune/domain';

import type {
  PlaneGcsDefinitionResult,
  PlaneGcsPreviewRequest,
  PlaneGcsPreviewResult,
  PlaneGcsWorkerResult,
} from './browser-planegcs-protocol';
import { LatestPreviewQueue } from './latest-preview-queue';

interface PreviewSubmission {
  readonly dragSessionId: string;
  readonly generation: number;
  readonly document: SketchDocument;
  readonly nodeId?: string;
  readonly target?: SketchPoint2D;
  readonly receive: (result: PlaneGcsPreviewResult) => void;
}

class BrowserPlaneGcsPreviewRuntime {
  readonly #worker: Worker;
  readonly #queue: LatestPreviewQueue<PreviewSubmission, PlaneGcsPreviewResult>;
  readonly #definitionRequests = new Map<
    string,
    {
      readonly resolve: (analysis: DefinitionStateAnalysis) => void;
      readonly reject: (error: Error) => void;
    }
  >();

  constructor() {
    this.#worker = new Worker(new URL('./browser-planegcs.worker.ts', import.meta.url), {
      type: 'module',
      name: 'attune-planegcs-preview',
    });
    this.#queue = new LatestPreviewQueue(
      (request) => {
        const message: PlaneGcsPreviewRequest = {
          type: 'preview',
          dragSessionId: request.dragSessionId,
          generation: request.generation,
          document: request.document,
          ...(request.nodeId ? { nodeId: request.nodeId } : {}),
          ...(request.target ? { target: request.target } : {}),
        };
        this.#worker.postMessage(message, []);
      },
      (result) => {
        const latest = this.#latestReceiver;
        if (
          latest?.dragSessionId === result.dragSessionId &&
          latest.generation === result.generation
        )
          latest.receive(result);
      },
    );
    this.#worker.addEventListener('message', ({ data }: MessageEvent<PlaneGcsWorkerResult>) => {
      if (data.type === 'preview-result') {
        this.#queue.resolve(data);
        return;
      }
      if (data.type === 'definition-result') {
        this.#resolveDefinition(data);
        return;
      }
      if (data.requestId) {
        const request = this.#definitionRequests.get(data.requestId);
        this.#definitionRequests.delete(data.requestId);
        request?.reject(new Error(data.message));
      } else if (data.dragSessionId && data.generation !== undefined) {
        this.#queue.reject({
          dragSessionId: data.dragSessionId,
          generation: data.generation,
        });
      }
    });
  }

  #latestReceiver: PreviewSubmission | null = null;

  preview(submission: PreviewSubmission): void {
    this.#latestReceiver = submission;
    this.#queue.enqueue(submission);
  }

  cancel(dragSessionId: string): void {
    this.#queue.cancel(dragSessionId);
    if (this.#latestReceiver?.dragSessionId === dragSessionId) this.#latestReceiver = null;
  }

  analyze(document: SketchDocument): Promise<DefinitionStateAnalysis> {
    const requestId = `definition:${document.id}:${document.revision}:${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      this.#definitionRequests.set(requestId, { resolve, reject });
      this.#worker.postMessage({ type: 'definition', requestId, document }, []);
    });
  }

  #resolveDefinition(result: PlaneGcsDefinitionResult): void {
    const request = this.#definitionRequests.get(result.requestId);
    this.#definitionRequests.delete(result.requestId);
    request?.resolve(result.analysis);
  }
}

let sharedRuntime: BrowserPlaneGcsPreviewRuntime | undefined;

/** One browser Web Worker and one lazily initialized PlaneGCS WASM runtime per page. */
export function getBrowserPlaneGcsPreviewRuntime(): BrowserPlaneGcsPreviewRuntime {
  sharedRuntime ??= new BrowserPlaneGcsPreviewRuntime();
  return sharedRuntime;
}
