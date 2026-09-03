import {
  databaseConfigured,
  ensureJudgeWorkspace,
  JUDGE_WORKSPACE_ID,
  listProjectsForUser,
} from '@attune/database';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ProductSettings } from '../../components/product-settings';
import { currentAttuneUser } from '../../lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!databaseConfigured()) {
    return (
      <main className="product-page setup-page">
        <Link className="wordmark" href="/">
          ATTUNE
        </Link>
        <section className="setup-card">
          <p className="section-index">PERSISTENCE GATE</p>
          <h1>Settings need the permanent Neon project.</h1>
          <p>Configure the existing database variables, then run the checked-in migration.</p>
        </section>
      </main>
    );
  }
  const user = await currentAttuneUser();
  if (!user) redirect('/sign-in');
  if (user.judge) await ensureJudgeWorkspace();
  const projects = user.judge ? [] : await listProjectsForUser(user.userId);
  const workspaceId = user.judge ? JUDGE_WORKSPACE_ID : projects[0]?.workspaceId;
  return <ProductSettings workspaceId={workspaceId} />;
}
