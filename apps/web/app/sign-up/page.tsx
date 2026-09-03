import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import Link from 'next/link';

import { MechanicalPreview } from '../../components/mechanical-preview';
import { neonAuthConfigured } from '../../lib/auth/neon';
import { signUp } from '../auth-actions';

export const dynamic = 'force-dynamic';

export default async function SignUpPage({
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
        <p className="landing-kicker">Create an account</p>
        <h1>Start with the design</h1>
        <p className="auth-intro">
          Build a shared specification, find a capable maker, and keep every order tied to the
          revision you approved.
        </p>
        {neonAuthConfigured() ? (
          <form action={signUp}>
            <label htmlFor="sign-up-name">
              Name
              <Input
                id="sign-up-name"
                name="name"
                type="text"
                autoComplete="name"
                aria-label="Name"
                required
              />
            </label>
            <label htmlFor="sign-up-email">
              Email
              <Input
                id="sign-up-email"
                name="email"
                type="email"
                autoComplete="email"
                aria-label="Email"
                required
              />
            </label>
            <label htmlFor="sign-up-password">
              Password
              <Input
                id="sign-up-password"
                name="password"
                type="password"
                autoComplete="new-password"
                aria-label="Password"
                minLength={8}
                required
              />
            </label>
            {error ? (
              <p className="form-error">Registration failed. Check the fields and retry.</p>
            ) : null}
            <Button type="submit" variant="primary">
              Create account
            </Button>
          </form>
        ) : (
          <div className="setup-callout">
            <strong>Neon Auth connection required</strong>
            <p>Add NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET to Vercel.</p>
          </div>
        )}
        <p className="auth-switch">
          Already a member? <Link href="/sign-in">Sign in</Link>
        </p>
      </section>
      <aside className="auth-visual">
        <MechanicalPreview compact />
      </aside>
    </main>
  );
}
