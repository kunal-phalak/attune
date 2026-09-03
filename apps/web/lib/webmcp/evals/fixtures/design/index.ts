export const DESIGN_EVAL_FIXTURES = {
  blank_editor: { role: 'editor', document: 'blank', selection: [] },
  selected_radius: { role: 'editor', selection: ['arc:fillet:1'], expectedVersion: 3 },
  tangent_candidates: { role: 'editor', selection: ['line:edge:1', 'arc:fillet:1'] },
  stale_reference: { role: 'editor', semanticRef: 'circle:bore', expectedVersion: 1, latestVersion: 2 },
} as const;
