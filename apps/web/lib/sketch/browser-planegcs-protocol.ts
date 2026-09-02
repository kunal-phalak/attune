import type { DefinitionStateAnalysis, SketchDocument, SketchPoint2D } from '@attune/domain';

export interface PlaneGcsPreviewRequest {
  readonly type: 'preview';
  readonly dragSessionId: string;
  readonly generation: number;
  readonly document: SketchDocument;
  readonly nodeId?: string;
  readonly target?: SketchPoint2D;
}

export interface PlaneGcsPreviewResult {
  readonly type: 'preview-result';
  readonly dragSessionId: string;
  readonly generation: number;
  readonly status: SketchDocument['lastSolve'] extends { status: infer Status } ? Status : string;
  readonly document: SketchDocument;
  readonly immobile: boolean;
  readonly message?: string;
}

export interface PlaneGcsDefinitionRequest {
  readonly type: 'definition';
  readonly requestId: string;
  readonly document: SketchDocument;
}

export interface PlaneGcsDefinitionResult {
  readonly type: 'definition-result';
  readonly requestId: string;
  readonly analysis: DefinitionStateAnalysis;
}

export interface PlaneGcsWorkerError {
  readonly type: 'error';
  readonly requestId?: string;
  readonly dragSessionId?: string;
  readonly generation?: number;
  readonly message: string;
}

export type PlaneGcsWorkerRequest = PlaneGcsPreviewRequest | PlaneGcsDefinitionRequest;
export type PlaneGcsWorkerResult =
  | PlaneGcsPreviewResult
  | PlaneGcsDefinitionResult
  | PlaneGcsWorkerError;
