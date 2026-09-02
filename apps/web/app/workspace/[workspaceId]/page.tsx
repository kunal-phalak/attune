import {
  databaseConfigured,
  ensureJudgeWorkspace,
  identityForWorkspace,
  liveblocksRoomIdForWorkspace,
  readWorkspaceBundle,
  type WorkspaceIdentity,
} from '@attune/database';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { WorkspaceProduct } from '../../../components/workspace-product';
import { viewForTrustedBundle } from '../../../lib/attune-runtime';
import { currentAttuneUser } from '../../../lib/auth/session';
import { liveblocksConfigured, liveblocksRoomPermission } from '../../../lib/liveblocks/server';

export const dynamic = 'force-dynamic';

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
  readonly searchParams: Promise<{ readonly perspective?: string }>;
}) {
  if (!databaseConfigured()) return <PersistenceGate />;
  const user = await currentAttuneUser();
  if (!user) redirect('/sign-in');
  if (user.judge) await ensureJudgeWorkspace();
  const { workspaceId: encodedWorkspaceId } = await params;
  const workspaceId = decodeURIComponent(encodedWorkspaceId);
  const membership = await identityForWorkspace(workspaceId, user.userId, user.principalId);
  let identity: WorkspaceIdentity | null = membership;
  if (liveblocksConfigured()) {
    const roomId = await liveblocksRoomIdForWorkspace(workspaceId).catch(() => null);
    if (!roomId) notFound();
    const permission = await liveblocksRoomPermission(roomId, user.userId);
    if (!permission.read) notFound();
    identity = {
      userId: user.userId,
      principalId: user.principalId,
      displayName: membership?.displayName ?? user.displayName,
      roles: permission.write
        ? membership?.roles.length
          ? membership.roles
          : ['buyer']
        : ['reviewer'],
    };
  }
  if (!identity) notFound();
  const requestedPerspective = (await searchParams).perspective;
  const perspective = requestedPerspective === 'provider' ? 'provider' : 'buyer';
  if (requestedPerspective === 'provider' && !identity.roles.includes('provider')) notFound();
  const bundle = await readWorkspaceBundle(workspaceId);
  const initialView = await viewForTrustedBundle(bundle, perspective, identity);
  return (
    <WorkspaceProduct
      workspaceId={workspaceId}
      roomId={bundle.liveblocksRoomId}
      collaboration={liveblocksConfigured()}
      perspective={perspective}
      projectName={bundle.projectName}
      initialView={initialView}
      actor={{
        id: user.userId,
        name: user.displayName,
        role: perspective,
      }}
    />
  );
}
