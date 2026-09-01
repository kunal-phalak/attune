import {
  canCreateProjectsForUser,
  databaseConfigured,
  ensureJudgeWorkspace,
  listProjectsForUser,
} from '@attune/database';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardLibrary, type AttuneLibraryFile } from '../../components/dashboard-library';
import { currentAttuneUser } from '../../lib/auth/session';
import { liveblocksConfigured } from '../../lib/liveblocks/server';
import { parseLibraryFilter } from '../../lib/projects/library';

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

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly view?: string }>;
}) {
  if (!databaseConfigured()) return <SetupRequired />;
  const user = await currentAttuneUser();
  if (!user) redirect('/sign-in');
  if (user.judge) await ensureJudgeWorkspace();
  const [projectRows, hasProjectCreatePermission] = await Promise.all([
    listProjectsForUser(user.userId),
    canCreateProjectsForUser(user.userId),
  ]);
  const files: AttuneLibraryFile[] = projectRows.map((row) => ({
    workspaceId: row.workspaceId,
    roomId: row.liveblocksRoomId,
    projectName: row.projectName,
    updatedAt: row.updatedAt,
    status: 'draft',
    access: row.access,
    template: row.template,
  }));
  const filter = parseLibraryFilter((await searchParams).view);
  const collaboration = liveblocksConfigured();

  return (
    <DashboardLibrary
      files={files}
      collaboration={collaboration}
      user={{ id: user.userId, name: user.displayName }}
      filter={filter}
      canCreate={hasProjectCreatePermission && collaboration}
    />
  );
}
