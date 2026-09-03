import {
  buyerCommerceProfile,
  ensureJudgeWorkspace,
  JUDGE_WORKSPACE_ID,
  listShopifyInstallations,
} from '@attune/database';
import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import type { Metadata } from 'next';
import Link from 'next/link';

import { JudgeControlPanel } from '../../components/judge-control-panel';
import { inspectForHuman } from '../../lib/attune-runtime';
import { currentJudgeAttuneUser, judgeCredentialConfigured } from '../../lib/auth/session';
import { buyerCommerceProfileComplete } from '../../lib/manufacturing/buyer-commerce';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Judge access — Attune',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function JudgeAccessPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly error?: string }>;
}) {
  const invalidCode = (await searchParams).error === 'invalid-code';
  const configured = judgeCredentialConfigured();
  const user = await currentJudgeAttuneUser();

  if (user?.judge) {
    await ensureJudgeWorkspace();
    const [view, profile, installations] = await Promise.all([
      inspectForHuman(JUDGE_WORKSPACE_ID, 'buyer'),
      buyerCommerceProfile(user.principalId),
      listShopifyInstallations(user.principalId),
    ]);
    const makerName = view.workspace.providerCapabilityProfile.providerName;
    const installation = installations.find(
      ({ connectionStatus, makerProfile, shopName }) =>
        (connectionStatus === 'connected' || connectionStatus === 'needs_reauthorization') &&
        (makerProfile?.providerName === makerName || shopName === makerName),
    );
    const location = installation?.locations.find(
      ({ id }) => id === installation.selectedLocationId,
    );

    return (
      <JudgeControlPanel
        initialView={view}
        buyerReady={buyerCommerceProfileComplete(profile)}
        makerName={makerName}
        makerConnected={Boolean(installation)}
        shopName={installation?.shopName}
        shopDomain={installation?.primaryDomain}
        locationName={location?.name}
      />
    );
  }

  return (
    <main className="judge-page">
      <header className="judge-topbar">
        <Link className="wordmark" href="/">
          Attune
        </Link>
        <span>Challenge review · secure access</span>
      </header>
      <section className="judge-access">
        <div className="judge-introduction">
          <p className="section-index">Precision design / review workspace</p>
          <h1>Review the complete workflow.</h1>
          <p>
            Enter the supplied access code to open the persisted manufacturing workspace. The code
            is submitted once in the request body and is never placed in the URL.
          </p>
          <ol aria-label="Attune review sequence">
            <li>Start in the dashboard with the seeded project</li>
            <li>Use automatically registered contextual WebMCP tools</li>
            <li>Follow the guided Buyer-to-Maker state path</li>
          </ol>
        </div>
        <LayerCard render={<div />} className="judge-form-panel">
          <div className="judge-form-heading">
            <span>Protected review</span>
            <strong>Seeded workspace</strong>
          </div>
          {configured ? (
            <form action="/api/judge-session" method="post">
              <label htmlFor="access-code">Access code</label>
              <Input
                id="access-code"
                name="accessCode"
                type="password"
                aria-label="Access code"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={256}
                required
              />
              {invalidCode ? (
                <p className="form-error" role="alert">
                  That access code was not accepted. Check the supplied code and retry.
                </p>
              ) : null}
              <Button type="submit" variant="primary">
                Open review dashboard
              </Button>
            </form>
          ) : (
            <div className="setup-callout">
              <strong>Judge access is not configured</strong>
              <p>The release environment is missing its judge digest or session secret.</p>
            </div>
          )}
          <p className="judge-privacy-note">
            A renewable, signed HttpOnly session is created after server verification.
          </p>
        </LayerCard>
      </section>
    </main>
  );
}
