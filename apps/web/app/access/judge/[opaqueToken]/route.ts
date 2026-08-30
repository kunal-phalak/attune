import { ensureJudgeWorkspace, JUDGE_WORKSPACE_ID } from '@attune/database';
import { redirect } from 'next/navigation';

import { establishJudgeSession } from '../../../../lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly opaqueToken: string }> },
) {
  const { opaqueToken } = await context.params;
  if (!(await establishJudgeSession(opaqueToken))) redirect('/sign-in?error=invalid-judge-access');
  await ensureJudgeWorkspace();
  redirect(`/workspace/${encodeURIComponent(JUDGE_WORKSPACE_ID)}`);
}
