export const CUSTOMER_EVAL_FIXTURES = {
  missing_profile: { profile: null, binding: null },
  complete_unbound: { profile: 'complete', binding: null },
  bound: { profile: 'complete', binding: 'store-specific' },
  quote_sent: { draftOrder: 'reread-required' },
} as const;
