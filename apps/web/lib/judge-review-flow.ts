import type { AttuneApiView } from './attune-view';

export type JudgeReviewStepId =
  | 'dashboard'
  | 'design'
  | 'buyer_requests'
  | 'maker_requests'
  | 'buyer_orders'
  | 'maker_jobs';

export interface JudgeReviewStep {
  readonly id: JudgeReviewStepId;
  readonly label: string;
  readonly state: 'available' | 'seeded' | 'locked';
  readonly href: string;
  readonly when: string;
  readonly why: string;
}

export interface JudgeReviewFlow {
  readonly steps: readonly JudgeReviewStep[];
  readonly recommendedStepId: JudgeReviewStepId;
}

export function judgeReviewFlow(view: AttuneApiView): JudgeReviewFlow {
  const workspaceHref = `/workspace/${encodeURIComponent(view.product.workspaceId)}`;
  const request = view.workspace.manufacturingRequests.findLast(
    ({ status }) => status !== 'SUPERSEDED' && status !== 'STALE',
  );
  const quote = request
    ? view.workspace.quotes.findLast(({ requestId }) => requestId === request.requestId)
    : undefined;
  const acceptance = quote
    ? view.workspace.acceptances.find(({ quoteId }) => quoteId === quote.quoteId)
    : undefined;
  const commerce = acceptance
    ? view.workspace.externalCommerceRecords.find(
        ({ requestId, versionId }) =>
          requestId === acceptance.requestId && versionId === acceptance.versionId,
      )
    : undefined;

  const recommendedStepId: JudgeReviewStepId = !request
    ? 'design'
    : !quote || (quote.status !== 'READY' && quote.status !== 'ACCEPTED')
      ? 'maker_requests'
      : !acceptance
        ? 'buyer_orders'
        : 'maker_jobs';

  return {
    recommendedStepId,
    steps: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        state: 'available',
        href: '/dashboard',
        when: 'Start here after judge sign-in.',
        why: 'Confirm the seeded project and see the full review route before opening it.',
      },
      {
        id: 'design',
        label: 'Design workspace',
        state: request ? 'seeded' : 'available',
        href: workspaceHref,
        when: request
          ? 'An exact version is already attached to a request.'
          : 'Open after orientation.',
        why: 'Inspect, repair, and validate the geometry before any commercial commitment.',
      },
      {
        id: 'buyer_requests',
        label: 'Buyer request',
        state: request ? 'seeded' : view.validation.valid ? 'available' : 'locked',
        href: `${workspaceHref}?perspective=buyer&surface=buyer_requests`,
        when: request
          ? `Version ${request.versionNumber} was submitted.`
          : view.validation.valid
            ? 'Available once the design is checked.'
            : 'Available after design conflicts are resolved.',
        why: 'Bind requirements, quantity, and the chosen Maker to one immutable version.',
      },
      {
        id: 'maker_requests',
        label: 'Maker review',
        state: quote ? 'seeded' : request ? 'available' : 'locked',
        href: `${workspaceHref}?perspective=provider&surface=provider_requests`,
        when: quote
          ? 'The Maker has prepared a quote.'
          : request
            ? 'Available after the Buyer submits.'
            : 'Waiting for a Buyer request.',
        why: 'Review the frozen revision, request changes, or prepare the exact-version quote.',
      },
      {
        id: 'buyer_orders',
        label: 'Buyer order',
        state: acceptance ? 'seeded' : quote?.status === 'READY' ? 'available' : 'locked',
        href: `${workspaceHref}?perspective=buyer&surface=buyer_orders`,
        when: acceptance
          ? 'The Buyer accepted the exact quote.'
          : quote?.status === 'READY'
            ? 'Available after the Maker sends a quote.'
            : 'Waiting for a ready quote.',
        why: 'Verify price, version, and specification hash before the Buyer accepts.',
      },
      {
        id: 'maker_jobs',
        label: 'Maker job & Shopify',
        state: commerce ? 'seeded' : acceptance ? 'available' : 'locked',
        href: `${workspaceHref}?perspective=provider&surface=provider_jobs`,
        when: commerce
          ? 'The accepted revision has been materialized.'
          : acceptance
            ? 'Available after Buyer acceptance.'
            : 'Waiting for an accepted quote.',
        why: 'Materialize only the accepted revision, then continue through Shopify WebMCP.',
      },
    ],
  };
}
