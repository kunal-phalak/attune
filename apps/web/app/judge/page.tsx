import type { Metadata } from 'next';
import Link from 'next/link';

import { judgeCredentialConfigured } from '../../lib/auth/session';

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

  return (
    <main className="judge-page">
      <header className="judge-topbar">
        <Link className="wordmark" href="/">
          ATTUNE
        </Link>
        <span>Challenge review · secure access</span>
      </header>
      <section className="judge-access">
        <div className="judge-introduction">
          <p className="section-index">PRECISION DESIGN / REVIEW WORKSPACE</p>
          <h1>Review the executable thread.</h1>
          <p>
            Enter the supplied access code to open the persisted manufacturing workspace. The code
            is submitted once in the request body and is never placed in the URL.
          </p>
          <ol aria-label="Attune review sequence">
            <li>Inspect authoritative r8</li>
            <li>Discover contextual WebMCP tools</li>
            <li>Verify human and agent receipts</li>
          </ol>
        </div>
        <div className="judge-form-panel">
          <div className="judge-form-heading">
            <span>Protected review</span>
            <strong>Seeded workspace</strong>
          </div>
          {configured ? (
            <form action="/api/judge-session" method="post">
              <label htmlFor="access-code">Access code</label>
              <input
                id="access-code"
                name="accessCode"
                type="password"
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
              <button type="submit">Open design workspace</button>
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
        </div>
      </section>
    </main>
  );
}
