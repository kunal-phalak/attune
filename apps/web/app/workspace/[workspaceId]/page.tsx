import {
  databaseConfigured,
  ensureJudgeWorkspace,
  readWorkspaceBundle,
  userCanManageLiveblocksRoom,
} from '@attune/database';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import type { ManufacturingSurface } from '../../../components/manufacturing-flow';
import { WorkspaceProduct } from '../../../components/workspace-product';
import { viewForTrustedBundle } from '../../../lib/attune-runtime';
import { currentAttuneUser, workspaceIdentity } from '../../../lib/auth/session';
import { liveblocksConfigured } from '../../../lib/liveblocks/server';

export const dynamic = 'force-dynamic';

function manufacturingSurface(value: string | undefined): ManufacturingSurface {
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
  return 'design';
}

function PersistenceGate() {
  return (
    <main className="product-page setup-page">
      <Link className="wordmark" href="/">
        ATTUNE
      </Link>
      <section className="setup-card">
        <p className="section-index">WORKSPACE PERSISTENCE</p>
        <h1>Neon is required for the real workspace.</h1>
        <p>
          Connect DATABASE_URL and run pnpm db:migrate. This route never falls back to process
          memory.
        </p>
      </section>
    </main>
  );
}

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly workspaceId: string }>;
  readonly searchParams: Promise<{ readonly perspective?: string; readonly surface?: string }>;
}) {
  if (!databaseConfigured()) return <PersistenceGate />;
  const user = await currentAttuneUser();
  if (!user) redirect('/sign-in');
  if (user.judge) await ensureJudgeWorkspace();
  const { workspaceId: encodedWorkspaceId } = await params;
  const workspaceId = decodeURIComponent(encodedWorkspaceId);
  const identity = await workspaceIdentity(workspaceId).catch(() => null);
  if (!identity) notFound();
  const parameters = await searchParams;
  const requestedPerspective = parameters.perspective;
  const role =
    requestedPerspective === 'provider' && identity.roles.includes('provider')
      ? 'provider'
      : identity.roles.includes('buyer')
        ? 'buyer'
        : identity.roles.includes('editor')
          ? 'editor'
          : 'reviewer';
  const perspective = role === 'provider' ? 'provider' : 'buyer';
  const bundle = await readWorkspaceBundle(workspaceId);
  const canManageSharing = await userCanManageLiveblocksRoom(bundle.liveblocksRoomId, user.userId);
  const initialView = await viewForTrustedBundle(bundle, role, identity);
  const requestedSurface = manufacturingSurface(parameters.surface);
  const initialSurface =
    role === 'buyer'
      ? requestedSurface === 'provider_requests' ||
        requestedSurface === 'provider_jobs' ||
        requestedSurface === 'provider_profile'
        ? 'design'
        : requestedSurface
      : role === 'provider'
        ? requestedSurface === 'marketplace' ||
          requestedSurface === 'buyer_requests' ||
          requestedSurface === 'buyer_orders'
          ? 'design'
          : requestedSurface
        : 'design';
  return (
    <WorkspaceProduct
      workspaceId={workspaceId}
      roomId={bundle.liveblocksRoomId}
      collaboration={liveblocksConfigured()}
      perspective={perspective}
      projectName={bundle.projectName}
      initialView={initialView}
      initialSurface={initialSurface}
      canManageSharing={canManageSharing}
      actor={{
        id: user.userId,
        name: user.displayName,
        role,
      }}
    />
  );
}
