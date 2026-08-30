import { databaseConfigured, ensureJudgeWorkspace, listProjectsForUser } from '@attune/database';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardLibrary, type AttuneLibraryFile } from '../../components/dashboard-library';
import { inspectForHuman } from '../../lib/attune-runtime';
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
  const files: AttuneLibraryFile[] = await Promise.all(
    projectRows.map(async (row) => {
      const view = await inspectForHuman(row.workspaceId);
      const currentRevisionId = `r${view.workspace.draftVersion}`;
      return {
        workspaceId: row.workspaceId,
        projectName: row.projectName,
        projectCode: row.projectCode,
        workspaceName: row.workspaceName,
        fileName: row.fileName,
        draftVersion: row.draftVersion,
        updatedAt: row.updatedAt,
        valid: view.validation.valid,
        frozen: view.workspace.frozenRevisions.some(
          ({ revisionId, specHash }) =>
            revisionId === currentRevisionId && specHash === view.specHash,
        ),
        accepted: view.workspace.acceptances.some(
          ({ revisionId, specHash }) =>
            revisionId === currentRevisionId && specHash === view.specHash,
        ),
        verified: view.workspace.commerceLinks.some(
          ({ revisionId, specHash }) =>
            revisionId === currentRevisionId && specHash === view.specHash,
        ),
        collaborators: [user.displayName, 'Provider', 'Attune agent'],
      };
    }),
  );

  return <DashboardLibrary files={files} displayName={user.displayName} />;
}
