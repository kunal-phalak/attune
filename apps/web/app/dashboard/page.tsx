import {
  canCreateProjectsForUser,
  databaseConfigured,
  ensureJudgeWorkspace,
  JUDGE_WORKSPACE_ID,
  listProjectsForLiveblocksRooms,
  listProjectsForUser,
} from '@attune/database';
import {
  arcPoint,
  bsplinePoint,
  ellipsePoint,
  geometryBounds,
  positiveArcSweep,
  synchronizeGeometryWithNodes,
  type SketchDocument,
} from '@attune/domain';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardLibrary, type AttuneLibraryFile } from '../../components/dashboard-library';
import { DashboardNotifications } from '../../components/dashboard-notifications';
import { currentAttuneUser } from '../../lib/auth/session';
import { liveblocksConfigured, liveblocksRoomIdsForUser } from '../../lib/liveblocks/server';
import {
  mergeLibraryProjects,
  parseLibraryFilter,
  type SketchThumbnail,
} from '../../lib/projects/library';

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
    thumbnail: thumbnailForSketch(row.sketchDocument),
  };
}

function thumbnailForSketch(document: SketchDocument): SketchThumbnail {
  const geometry = synchronizeGeometryWithNodes(document.entities, document.nodes);
  const entityBounds = geometry.map(geometryBounds);
  const bounds = entityBounds.slice(1).reduce(
    (combined, next) => ({
      minX: Math.min(combined.minX, next.minX),
      minY: Math.min(combined.minY, next.minY),
      maxX: Math.max(combined.maxX, next.maxX),
      maxY: Math.max(combined.maxY, next.maxY),
    }),
    entityBounds[0] ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  );
  const entities = geometry.flatMap((entity): SketchThumbnail['entities'] => {
    if (entity.kind === 'point') {
      return [{ kind: 'circle', id: entity.id, center: entity.position, radius: 0.75 }];
    }
    if (entity.kind === 'line') {
      return [{ kind: 'line', id: entity.id, start: entity.start, end: entity.end }];
    }
    if (entity.kind === 'circle') {
      return [{ kind: 'circle', id: entity.id, center: entity.center, radius: entity.radius }];
    }
    if (entity.kind === 'arc') {
      return [
        {
          kind: 'arc',
          id: entity.id,
          start: arcPoint(entity, entity.startAngle),
          end: arcPoint(entity, entity.endAngle),
          radius: entity.radius,
          largeArc: positiveArcSweep(entity.startAngle, entity.endAngle) > Math.PI,
        },
      ];
    }
    if (entity.kind === 'ellipse') {
      return [
        {
          kind: 'polyline',
          id: entity.id,
          points: Array.from({ length: 49 }, (_, index) =>
            ellipsePoint(entity, (index / 48) * Math.PI * 2),
          ),
        },
      ];
    }
    return [
      {
        kind: 'polyline',
        id: entity.id,
        points: Array.from({ length: 49 }, (_, index) => bsplinePoint(entity, index / 48)),
      },
    ];
  });
  return { bounds, entities };
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
      headerAction={collaboration ? <DashboardNotifications key="dashboard-notifications" /> : null}
      operationalWorkspaceId={user.judge ? JUDGE_WORKSPACE_ID : undefined}
    />
  );
}
