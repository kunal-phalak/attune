import {
  canCreateProjectsForUser,
  databaseConfigured,
  ensureJudgeWorkspace,
  grantShopifyMakerAuthority,
  JUDGE_WORKSPACE_ID,
  listProjectsForLiveblocksRooms,
  listProjectsForUser,
  listShopifyInstallations,
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
import type { DashboardAgentProject } from '../../components/dashboard-webmcp';
import type { ManufacturingSurface } from '../../components/manufacturing-flow';
import { inspectForHuman } from '../../lib/attune-runtime';
import { currentAttuneUser } from '../../lib/auth/session';
import { judgeReviewFlow } from '../../lib/judge-review-flow';
import { liveblocksConfigured, liveblocksRoomIdsForUser } from '../../lib/liveblocks/server';
import {
  mergeLibraryProjects,
  parseLibraryFilter,
  type SketchThumbnail,
} from '../../lib/projects/library';

export const dynamic = 'force-dynamic';

type LibraryRow =
  | Awaited<ReturnType<typeof listProjectsForUser>>[number]
  | Awaited<ReturnType<typeof listProjectsForLiveblocksRooms>>[number];

function dashboardManufacturingSurface(
  value: string | undefined,
): Exclude<ManufacturingSurface, 'design'> | undefined {
  if (
    value === 'marketplace' ||
    value === 'buyer_requests' ||
    value === 'buyer_orders' ||
    value === 'provider_requests' ||
    value === 'provider_jobs' ||
    value === 'provider_profile'
  ) {
    return value;
  }
  return undefined;
}

function toLibraryFile(row: LibraryRow): AttuneLibraryFile {
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

function toAgentProject(
  row: Awaited<ReturnType<typeof listProjectsForUser>>[number],
): DashboardAgentProject {
  const request = row.workspace.manufacturingRequests.findLast(
    ({ status }) => status !== 'SUPERSEDED',
  );
  const quote = request
    ? row.workspace.quotes.findLast(({ requestId }) => requestId === request.requestId)
    : undefined;
  const acceptance = request
    ? row.workspace.acceptances.findLast(({ requestId }) => requestId === request.requestId)
    : undefined;
  const draftOrder = request
    ? row.workspace.externalCommerceRecords.findLast(
        ({ requestId }) => requestId === request.requestId,
      )
    : undefined;
  return {
    workspaceId: row.workspaceId,
    projectName: row.projectName,
    updatedAt: row.updatedAt,
    draftVersion: row.draftVersion,
    roles: row.roles,
    request: request
      ? {
          requestId: request.requestId,
          status: request.status,
          versionNumber: request.versionNumber,
          updatedAt: request.updatedAt,
        }
      : null,
    quote: quote
      ? {
          quoteId: quote.quoteId,
          status: quote.status,
          amountMinor: quote.amountMinor,
          currency: quote.currency,
          ...(quote.leadTimeDays ? { leadTimeDays: quote.leadTimeDays } : {}),
        }
      : null,
    accepted: Boolean(acceptance),
    draftOrder: draftOrder
      ? {
          ...(draftOrder.name ? { name: draftOrder.name } : {}),
          status: draftOrder.status,
          updatedAt: draftOrder.updatedAt,
          checkoutAvailable: Boolean(draftOrder.invoiceUrl),
        }
      : null,
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
  readonly searchParams: Promise<{
    readonly view?: string;
    readonly surface?: string;
    readonly perspective?: string;
    readonly workspace_id?: string;
  }>;
}) {
  if (!databaseConfigured()) return <SetupRequired />;
  const user = await currentAttuneUser();
  if (!user) redirect('/sign-in');
  if (user.judge) await ensureJudgeWorkspace();
  const ownedShopifyInstallations = user.judge
    ? []
    : await listShopifyInstallations(user.principalId);
  const makerEnabled =
    user.judge ||
    ownedShopifyInstallations.some(
      ({ connectionStatus }) =>
        connectionStatus === 'connected' || connectionStatus === 'needs_reauthorization',
    );
  if (makerEnabled && !user.judge) await grantShopifyMakerAuthority(user.userId);
  const collaboration = liveblocksConfigured();
  const [membershipRows, hasProjectCreatePermission, accessibleRoomIds, judgeView] =
    await Promise.all([
      listProjectsForUser(user.userId),
      canCreateProjectsForUser(user.userId),
      collaboration ? liveblocksRoomIdsForUser(user.userId) : Promise.resolve([]),
      user.judge ? inspectForHuman(JUDGE_WORKSPACE_ID, 'buyer') : Promise.resolve(undefined),
    ]);
  const roomRows = collaboration ? await listProjectsForLiveblocksRooms(accessibleRoomIds) : [];
  const ownedFiles = membershipRows.filter((row) => row.access === 'owned').map(toLibraryFile);
  const liveblocksFiles = roomRows.map(toLibraryFile);
  const files = mergeLibraryProjects(ownedFiles, liveblocksFiles);
  const parameters = await searchParams;
  const filter = parseLibraryFilter(parameters.view);
  const requestedSurface = dashboardManufacturingSurface(parameters.surface);
  const requiredPerspective: 'buyer' | 'provider' = requestedSurface?.startsWith('provider_')
    ? 'provider'
    : 'buyer';
  const requestedWorkspace = membershipRows.find(
    ({ workspaceId }) => workspaceId === parameters.workspace_id,
  );
  const operationalProject =
    requestedWorkspace ??
    membershipRows.find(({ roles }) => roles.includes(requiredPerspective)) ??
    membershipRows[0];
  const operationalWorkspaceId = user.judge ? JUDGE_WORKSPACE_ID : operationalProject?.workspaceId;
  const canOpenRequestedSurface =
    requestedSurface &&
    operationalWorkspaceId &&
    (user.judge || operationalProject?.roles.includes(requiredPerspective));
  const manufacturing = canOpenRequestedSurface
    ? {
        workspaceId: operationalWorkspaceId,
        perspective: requiredPerspective,
        surface: requestedSurface,
        view:
          requiredPerspective === 'buyer' &&
          judgeView?.product.workspaceId === operationalWorkspaceId
            ? judgeView
            : await inspectForHuman(operationalWorkspaceId, requiredPerspective),
      }
    : undefined;

  return (
    <DashboardLibrary
      files={files}
      collaboration={collaboration}
      user={{ id: user.userId, name: user.displayName }}
      filter={filter}
      canCreate={hasProjectCreatePermission && collaboration}
      agentProjects={membershipRows.map(toAgentProject)}
      judgeFlow={judgeView ? judgeReviewFlow(judgeView) : undefined}
      showNotifications={collaboration}
      operationalWorkspaceId={operationalWorkspaceId}
      makerEnabled={makerEnabled}
      manufacturing={manufacturing}
    />
  );
}
