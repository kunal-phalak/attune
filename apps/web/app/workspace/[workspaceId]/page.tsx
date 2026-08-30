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
}: {
  readonly params: Promise<{ readonly workspaceId: string }>;
}) {
  if (!databaseConfigured()) return <PersistenceGate />;
  const user = await currentAttuneUser();
  if (!user) redirect('/sign-in');
  if (user.judge) await ensureJudgeWorkspace();
  const { workspaceId } = await params;
  const identity = await identityForWorkspace(workspaceId, user.userId, user.principalId);
  if (!identity) notFound();
  const bundle = await readWorkspaceBundle(workspaceId);
  return (
    <WorkspaceProduct
      workspaceId={workspaceId}
      roomId={bundle.liveblocksRoomId}
      collaboration={liveblocksConfigured()}
      actor={{
        id: user.userId,
        name: user.displayName,
        role: identity.roles[0] ?? 'buyer',
      }}
    />
  );
}
