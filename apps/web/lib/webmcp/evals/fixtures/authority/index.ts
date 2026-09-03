export const AUTHORITY_EVAL_FIXTURES = {
  viewer: { collaboration: 'viewer', businessRoles: [] },
  commenter: { collaboration: 'commenter', businessRoles: [] },
  buyer_only: { collaboration: 'editor', businessRoles: ['buyer'] },
  normal_workspace: { agentToolsEnabled: false },
  expired_delegation: { status: 'revalidation_required' },
} as const;
