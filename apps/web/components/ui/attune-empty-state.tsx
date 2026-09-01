import { Empty } from '@cloudflare/kumo/components/empty';
import type { ReactNode } from 'react';

export function AttuneEmptyState({
  media,
  title,
  description,
  actions,
}: {
  readonly media?: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}) {
  return (
    <Empty
      size="sm"
      className="attune-empty-state"
      icon={media}
      title={title}
      description={description}
      contents={actions ? <div className="attune-empty-state-actions">{actions}</div> : undefined}
    />
  );
}
