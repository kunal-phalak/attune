import {
  databaseConfigured,
  ensureJudgeWorkspace,
  identityForWorkspace,
  readWorkspaceBundle,
} from '@attune/database';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { WorkspaceProduct } from '../../../components/workspace-product';
import { currentAttuneUser } from '../../../lib/auth/session';
import { liveblocksConfigured } from '../../../lib/liveblocks/server';

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
  const identity = await identityForWorkspace(workspaceId, user.userId, user.principalId);
  if (!identity) notFound();
  const requestedPerspective = (await searchParams).perspective;
  const perspective = requestedPerspective === 'provider' ? 'provider' : 'buyer';
  if (!identity.roles.includes(perspective)) notFound();
  const bundle = await readWorkspaceBundle(workspaceId);
  return (
    <WorkspaceProduct
      workspaceId={workspaceId}
      roomId={bundle.liveblocksRoomId}
      collaboration={liveblocksConfigured()}
      perspective={perspective}
      projectName={bundle.projectName}
      template={bundle.fileKind === 'sketch:blank' ? 'blank' : 'spoke'}
      actor={{
        id: user.userId,
        name: user.displayName,
        role: perspective,
      }}
    />
  );
}
