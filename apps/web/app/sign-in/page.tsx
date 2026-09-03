import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import Link from 'next/link';

import { MechanicalPreview } from '../../components/mechanical-preview';
import { neonAuthConfigured } from '../../lib/auth/neon';
import { signIn } from '../auth-actions';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly error?: string }>;
}) {
  const error = (await searchParams).error;
  return (
    <main className="auth-page">
      <Link className="landing-wordmark auth-wordmark" href="/">
        Attune
      </Link>
      <section className="auth-card">
        <p className="landing-kicker">Welcome back</p>
        <h1>Sign in to your work</h1>
        <p className="auth-intro">
          Continue designing, reviewing quotes, and ordering exact revisions.
        </p>
        {neonAuthConfigured() ? (
          <form action={signIn}>
            <label htmlFor="sign-in-email">
              Email
              <Input id="sign-in-email" name="email" type="email" autoComplete="email" required />
            </label>
            <label htmlFor="sign-in-password">
              Password
              <Input
                id="sign-in-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error ? (
              <p className="form-error">Sign-in failed. Check your details and retry.</p>
            ) : null}
            <Button type="submit" variant="primary">
              Continue
            </Button>
          </form>
        ) : (
          <div className="setup-callout">
            <strong>Neon Auth connection required</strong>
            <p>Add NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET to Vercel.</p>
          </div>
        )}
        <p className="auth-switch">
          New to Attune? <Link href="/sign-up">Create an account</Link>
        </p>
      </section>
      <aside className="auth-visual">
        <MechanicalPreview compact />
      </aside>
    </main>
  );
}
