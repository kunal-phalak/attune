import {
  databaseConfigured,
  ensureJudgeWorkspace,
  JUDGE_WORKSPACE_ID,
  listProjectsForUser,
} from '@attune/database';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { currentAttuneUser } from '../../lib/auth/session';

export const dynamic = 'force-dynamic';

function SetupRequired() {
  return (
    <main className="product-page setup-page">
      <Link className="wordmark" href="/">
        ATTUNE
      </Link>
      <section className="setup-card">
        <p className="section-index">PERSISTENCE GATE</p>
        <h1>Connect the permanent Neon project.</h1>
        <p>
          Add DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET, ATTUNE_SESSION_SECRET,
          ATTUNE_JUDGE_TOKEN_HASH, and LIVEBLOCKS_SECRET_KEY to the Vercel project. Then run the
          checked-in Drizzle migration.
        </p>
      </section>
    </main>
  );
}

export default async function DashboardPage() {
  if (!databaseConfigured()) return <SetupRequired />;
  const user = await currentAttuneUser();
  if (!user) redirect('/sign-in');
  if (user.judge) await ensureJudgeWorkspace();
  const projectRows = await listProjectsForUser(user.userId);

  return (
    <main className="product-page dashboard-page">
      <header className="product-topbar">
        <Link className="wordmark" href="/">
          ATTUNE
        </Link>
        <div>
          <span>{user.displayName}</span>
          <span className="identity-badge">server verified</span>
        </div>
      </header>
      <section className="dashboard-heading">
        <div>
          <p className="section-index">PROJECTS + EXECUTABLE FILES</p>
          <h1>Recent work</h1>
        </div>
        <Link
          className="primary-link"
          href={`/workspace/${encodeURIComponent(JUDGE_WORKSPACE_ID)}`}
        >
          Open judge scenario
        </Link>
      </section>
      <section className="project-grid" aria-label="Attune projects">
        {projectRows.map((row) => (
          <Link
            className="project-card"
            href={`/workspace/${encodeURIComponent(row.workspaceId)}`}
            key={row.workspaceId}
          >
            <div>
              <span>{row.projectCode}</span>
              <span>epoch {row.capabilityEpoch}</span>
            </div>
            <h2>{row.projectName}</h2>
            <p>{row.fileName}</p>
            <dl>
              <div>
                <dt>Draft</dt>
                <dd>r{row.draftVersion}</dd>
              </div>
              <div>
                <dt>Workspace seq</dt>
                <dd>{row.workspaceSeq}</dd>
              </div>
            </dl>
          </Link>
        ))}
        {projectRows.length === 0 ? (
          <article className="empty-projects">
            <h2>No shared work yet.</h2>
            <p>Your organization projects will appear here after membership is granted.</p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
