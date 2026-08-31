import { databaseConfigured, ensureJudgeWorkspace, listProjectsForUser } from '@attune/database';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardLibrary, type AttuneLibraryFile } from '../../components/dashboard-library';
import { currentAttuneUser } from '../../lib/auth/session';
import { liveblocksConfigured } from '../../lib/liveblocks/server';

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
  const files: AttuneLibraryFile[] = projectRows.slice(0, 1).map((row) => ({
    workspaceId: row.workspaceId,
    roomId: row.liveblocksRoomId,
    projectName: 'Spoke sketch',
    updatedAt: row.updatedAt,
  }));

  return (
    <DashboardLibrary
      files={files}
      collaboration={liveblocksConfigured()}
      user={{ id: user.userId, name: user.displayName }}
    />
  );
}
