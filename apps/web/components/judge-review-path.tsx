import Link from 'next/link';

import type { AttuneApiView } from '../lib/attune-view';
import { judgeReviewFlow } from '../lib/judge-review-flow';

export function JudgeReviewPath({
  view,
  location,
}: {
  readonly view: AttuneApiView;
  readonly location: 'dashboard' | 'control-center';
}) {
  const flow = judgeReviewFlow(view);

  return (
    <ol className="judge-review-path" aria-label="Judge review flow">
      {flow.steps.map((step, index) => {
        const current = location === 'dashboard' && step.id === 'dashboard';
        const recommended = step.id === flow.recommendedStepId;
        const status = current
          ? 'You are here'
          : step.id === 'dashboard' && location === 'control-center'
            ? 'Start here'
            : step.state === 'seeded'
              ? 'Seeded'
              : recommended
                ? 'Next'
                : step.state === 'available'
                  ? 'Available'
                  : 'Waiting';
        const content = (
          <>
            <span className="judge-review-step-index">{index + 1}</span>
            <span className="judge-review-step-copy">
              <span className="judge-review-step-heading">
                <strong>{step.label}</strong>
                <small data-state={step.state} data-current={current || undefined}>
                  {status}
                </small>
              </span>
              <span>{step.when}</span>
              <em>{step.why}</em>
            </span>
          </>
        );

        return (
          <li key={step.id} data-state={step.state} data-current={current || undefined}>
            {step.state === 'locked' ? (
              <div aria-disabled="true">{content}</div>
            ) : (
              <Link href={step.href}>{content}</Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
