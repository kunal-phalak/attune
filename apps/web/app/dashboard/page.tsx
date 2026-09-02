import {
  canCreateProjectsForUser,
  databaseConfigured,
  ensureJudgeWorkspace,
  listProjectsForLiveblocksRooms,
  listProjectsForUser,
} from '@attune/database';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardLibrary, type AttuneLibraryFile } from '../../components/dashboard-library';
import { DashboardNotifications } from '../../components/dashboard-notifications';
import { currentAttuneUser } from '../../lib/auth/session';
import { liveblocksConfigured, liveblocksRoomIdsForUser } from '../../lib/liveblocks/server';
import { mergeLibraryProjects, parseLibraryFilter } from '../../lib/projects/library';

export const dynamic = 'force-dynamic';

function toLibraryFile(
  row: Awaited<ReturnType<typeof listProjectsForUser>>[number],
): AttuneLibraryFile {
  return {
    workspaceId: row.workspaceId,
    roomId: row.liveblocksRoomId,
    projectName: row.projectName,
    updatedAt: row.updatedAt,
    status: 'draft',
    access: row.access,
    canManage: row.canManage,
    template: row.template,
  };
}

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
  const collaboration = liveblocksConfigured();
  const [membershipRows, hasProjectCreatePermission, accessibleRoomIds] = await Promise.all([
    listProjectsForUser(user.userId),
    canCreateProjectsForUser(user.userId),
    collaboration ? liveblocksRoomIdsForUser(user.userId) : Promise.resolve([]),
  ]);
  const roomRows = collaboration ? await listProjectsForLiveblocksRooms(accessibleRoomIds) : [];
  const ownedFiles = membershipRows.filter((row) => row.access === 'owned').map(toLibraryFile);
  const liveblocksFiles = roomRows.map(toLibraryFile);
  const files = mergeLibraryProjects(ownedFiles, liveblocksFiles);
  const filter = parseLibraryFilter((await searchParams).view);

  return (
    <DashboardLibrary
      files={files}
      collaboration={collaboration}
      user={{ id: user.userId, name: user.displayName }}
      filter={filter}
      canCreate={hasProjectCreatePermission && collaboration}
      headerAction={collaboration ? <DashboardNotifications /> : null}
    />
  );
}
