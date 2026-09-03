'use client';

import { Badge } from '@cloudflare/kumo/components/badge';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  FactoryIcon,
  StorefrontIcon,
  UserCircleCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { track } from '@vercel/analytics';
import { useState } from 'react';

import { isAttuneApiView, type AttuneApiView } from '../lib/attune-view';
import { AttuneWebMcp, type AttuneWebMcpStatus } from './attune-webmcp';
import { JudgeReviewPath } from './judge-review-path';

interface JudgeControlPanelProps {
  readonly initialView: AttuneApiView;
  readonly buyerReady: boolean;
  readonly makerName: string;
  readonly makerConnected: boolean;
  readonly shopName?: string;
  readonly shopDomain?: string;
  readonly locationName?: string;
}

export function JudgeControlPanel({
  initialView,
  buyerReady,
  makerName,
  makerConnected,
  shopName,
  shopDomain,
  locationName,
}: JudgeControlPanelProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [view, setView] = useState(initialView);
  const [agentStatus, setAgentStatus] = useState<AttuneWebMcpStatus | null>(null);
  const agentRegistered = agentStatus?.registration === 'registered';
  const agentUnsupported = agentStatus?.registration === 'unsupported';

  const resetDemo = async () => {
    setResetting(true);
    setResetError(null);
    try {
      const response = await fetch('/api/attune/reset', {
        method: 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const nestedError =
          typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : null;
        const message =
          typeof nestedError === 'object' && nestedError !== null
            ? Reflect.get(nestedError, 'message')
            : null;
        throw new Error(typeof message === 'string' ? message : 'The demo could not be reset.');
      }
      if (isAttuneApiView(payload)) {
        setView(payload);
        window.dispatchEvent(new CustomEvent('attune:workspace-changed', { detail: payload }));
      }
      setResetComplete(true);
      setResetOpen(false);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'The demo could not be reset.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <main className="judge-control-page">
        <header className="judge-control-header">
          <div>
            <span className="manufacturing-eyebrow">Devpost WebMCP challenge</span>
            <h1>Judge control center</h1>
            <p>
              Check review readiness here, then start from the dashboard and follow the gated flow.
            </p>
          </div>
          <Badge variant="success" appearance="dot">
            Review session active
          </Badge>
        </header>

        {resetComplete ? (
          <output className="judge-reset-result">
            <CheckCircleIcon size={18} weight="fill" />
            <span>The demo workspace is back to its clean starting state.</span>
          </output>
        ) : null}
        {resetError ? (
          <div className="judge-reset-result" data-error role="alert">
            <WarningCircleIcon size={18} />
            <span>{resetError}</span>
          </div>
        ) : null}

        <section className="judge-control-grid" aria-label="Challenge readiness">
          <LayerCard render={<article />} className="judge-status-card">
            <div className="judge-card-heading">
              <CheckCircleIcon size={22} weight="fill" />
              <div>
                <span>Browser agent</span>
                <h2>WebMCP</h2>
              </div>
              <Badge
                variant={agentRegistered ? 'success' : agentUnsupported ? 'secondary' : 'warning'}
                appearance="dot"
              >
                {agentRegistered ? 'On' : agentUnsupported ? 'Unsupported' : 'Detecting'}
              </Badge>
            </div>
            <p>
              {agentUnsupported
                ? 'This browser does not expose document.modelContext. The full human flow remains available.'
                : 'Supported browsers register the current capability-derived tools automatically on every Attune surface.'}
            </p>
            <AttuneWebMcp
              workspaceId={view.product.workspaceId}
              perspective="buyer"
              surface="review_control_center"
              initialView={view}
              onStatus={setAgentStatus}
            />
          </LayerCard>

          <LayerCard render={<article />} className="judge-status-card">
            <div className="judge-card-heading">
              <UserCircleCheckIcon size={22} weight="fill" />
              <div>
                <span>Buyer workspace</span>
                <h2>Buyer</h2>
              </div>
              <Badge variant={buyerReady ? 'success' : 'warning'} appearance="dot">
                {buyerReady ? 'Ready' : 'Setup needed'}
              </Badge>
            </div>
            <p>Quote requests and accepted orders remain attached to their exact design version.</p>
          </LayerCard>

          <LayerCard render={<article />} className="judge-status-card">
            <div className="judge-card-heading">
              <FactoryIcon size={22} weight="fill" />
              <div>
                <span>Maker workspace</span>
                <h2>{makerName}</h2>
              </div>
              <Badge variant={makerConnected ? 'success' : 'warning'} appearance="dot">
                {makerConnected ? 'Connected' : 'Setup needed'}
              </Badge>
            </div>
            <dl className="judge-maker-facts">
              <div>
                <dt>Store</dt>
                <dd>{shopName ?? 'No connected Shopify store'}</dd>
              </div>
              <div>
                <dt>Domain</dt>
                <dd>{shopDomain ?? 'Not connected'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{locationName ?? 'Not selected'}</dd>
              </div>
            </dl>
          </LayerCard>
        </section>

        <section className="judge-flow-section" aria-labelledby="judge-flow-title">
          <div className="judge-flow-heading">
            <span className="manufacturing-eyebrow">Access order</span>
            <h2 id="judge-flow-title">When to open each workspace—and why</h2>
            <p>Locked steps become available only when the exact preceding decision exists.</p>
            <p>
              Seeded means the demo already contains that workflow record; it does not mean you
              reviewed the step.
            </p>
          </div>
          <JudgeReviewPath view={view} location="control-center" />
        </section>

        <LayerCard render={<section />} className="judge-workspace-card">
          <div>
            <span className="manufacturing-eyebrow">Review entry</span>
            <h2>Seeded project dashboard</h2>
            <p>
              Start with the project overview, then return here whenever you need the review order
              and rationale.
            </p>
          </div>
          <div className="judge-workspace-actions">
            <LinkButton
              onClick={() => {
                track('Judge Open Dashboard');
              }}
              href="/dashboard"
              variant="primary"
              icon={<ArrowRightIcon size={16} />}
            >
              Open dashboard
            </LinkButton>
            <Button type="button" variant="ghost" onClick={() => setResetOpen(true)}>
              Reset demo
            </Button>
          </div>
        </LayerCard>
      </main>

      <Dialog.Root open={resetOpen} onOpenChange={setResetOpen}>
        <Dialog size="sm">
          <div className="judge-reset-dialog">
            <StorefrontIcon size={24} />
            <Dialog.Title>Reset the demo workspace?</Dialog.Title>
            <Dialog.Description>
              This clears challenge workflow records and restores the clean design. Account roles,
              buyer details, Shopify connections, locations, and access settings are preserved.
            </Dialog.Description>
            <div className="judge-reset-actions">
              <Dialog.Close
                render={
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                }
              />
              <Button
                type="button"
                variant="destructive"
                loading={resetting}
                disabled={resetting}
                onClick={() => void resetDemo()}
              >
                Reset demo workspace
              </Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
