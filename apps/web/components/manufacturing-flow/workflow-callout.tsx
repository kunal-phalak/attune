'use client';

import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Collapsible } from '@cloudflare/kumo/components/collapsible';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { CaretDownIcon, SealCheckIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import type { AttuneApiView, CapabilityRole } from '../../lib/attune-view';
import type { ManufacturingSurface } from '../manufacturing-flow';

export function WorkflowCallout({
  workspaceId,
  perspective,
  view,
  onSurface,
}: {
  readonly workspaceId: string;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly view: AttuneApiView;
  readonly onSurface: (surface: ManufacturingSurface) => void;
}) {
  const state = useMemo(() => {
    const request = view.workspace.manufacturingRequests.findLast(
      ({ status }) => status !== 'SUPERSEDED',
    );
    const quote = request
      ? view.workspace.quotes.findLast(({ requestId }) => requestId === request.requestId)
      : undefined;
    const acceptance = quote
      ? view.workspace.acceptances.find(({ quoteId }) => quoteId === quote.quoteId)
      : undefined;
    if (!request || !quote) return null;
    if (acceptance) {
      return {
        key: `accepted:${acceptance.acceptanceId}`,
        title: 'Version accepted',
        detail: 'This exact version is ready for commerce.',
        versionNumber: acceptance.versionNumber,
        quote,
        kind: 'accepted' as const,
      };
    }
    if (quote.status !== 'READY') return null;
    return perspective === 'provider'
      ? {
          key: `maker:${quote.quoteId}`,
          title: 'Quote sent',
          detail: `${view.product.projectName} can now review Version ${quote.versionNumber}.`,
          versionNumber: quote.versionNumber,
          quote,
          kind: 'maker' as const,
        }
      : {
          key: `buyer:${quote.quoteId}`,
          title: 'Quote ready',
          detail: `${view.workspace.providerCapabilityProfile.providerName} quoted Version ${quote.versionNumber}.`,
          versionNumber: quote.versionNumber,
          quote,
          kind: 'buyer' as const,
        };
  }, [perspective, view.product.projectName, view.workspace]);
  const [open, setOpen] = useState(true);

  useEffect(() => setOpen(true), [state?.key]);
  if (!state) return null;

  return (
    <LayerCard render={<aside />} className="workflow-callout t-acc" data-open={open}>
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="workflow-callout-head">
          <span className="workflow-callout-icon">
            <SealCheckIcon size={18} weight="fill" />
          </span>
          <span>
            <strong>{state.title}</strong>
            {!open ? <small>Version {state.versionNumber}</small> : null}
          </span>
          <Collapsible.Trigger
            className="workflow-callout-toggle t-acc-head"
            aria-label={open ? 'Collapse workflow status' : 'Expand workflow status'}
          >
            <span className="t-acc-chevron">
              <CaretDownIcon size={16} />
            </span>
          </Collapsible.Trigger>
        </div>
        <Collapsible.Panel className="t-acc-panel">
          <div className="t-acc-panel-inner">
            <p>{state.detail}</p>
            <dl className="workflow-callout-facts">
              <div>
                <dt>Price</dt>
                <dd>
                  {new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: state.quote.currency,
                  }).format(state.quote.amountMinor / 100)}
                </dd>
              </div>
              <div>
                <dt>Lead time</dt>
                <dd>{state.quote.leadTimeDays ? `${state.quote.leadTimeDays} days` : 'Pending'}</dd>
              </div>
            </dl>
            <div className="workflow-callout-actions">
              {state.kind === 'maker' ? (
                <LinkButton
                  href={`/workspace/${encodeURIComponent(workspaceId)}?perspective=buyer&surface=buyer_requests`}
                  size="sm"
                  variant="primary"
                >
                  Go to Buyer view
                </LinkButton>
              ) : null}
              {state.kind === 'buyer' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => onSurface('buyer_requests')}
                >
                  Review quote
                </Button>
              ) : null}
              {state.kind === 'accepted' ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      onSurface(perspective === 'provider' ? 'provider_jobs' : 'buyer_orders')
                    }
                  >
                    Open {perspective === 'provider' ? 'job' : 'order'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onSurface('design')}
                  >
                    Return to design
                  </Button>
                </>
              ) : null}
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Collapse
              </Button>
            </div>
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </LayerCard>
  );
}
