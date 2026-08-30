import Link from 'next/link';

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
      <Link className="wordmark" href="/">
        ATTUNE
      </Link>
      <section className="auth-card">
        <p className="section-index">CREATE ACCOUNT</p>
        <h1>Start a physical specification.</h1>
        {neonAuthConfigured() ? (
          <form action={signUp}>
            <label>
              Name
              <input name="name" type="text" autoComplete="name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error ? (
              <p className="form-error">Registration failed. Check the fields and retry.</p>
            ) : null}
            <button type="submit">Create account</button>
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
    </main>
  );
}
