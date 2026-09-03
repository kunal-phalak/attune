export const MANUFACTURING_EVAL_FIXTURES = {
  compatible_design: { material: 'aluminium', thicknessMm: 3, validation: 'compatible' },
  saved_version: { versionId: 'version:fixture:2', versionNumber: 2, previewStatus: 'STORED' },
  submitted_request: { requestId: 'request:fixture:2', status: 'PROVIDER_REVIEW_REQUESTED' },
  maker_request: { requestId: 'request:fixture:2', exactVersionLocked: true },
  quote_ready_buyer: { quoteId: 'quote:fixture:2', status: 'READY' },
  quoted_then_edited: { quoteId: 'quote:fixture:2', status: 'STALE' },
} as const;
