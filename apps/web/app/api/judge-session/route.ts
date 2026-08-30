import { ensureJudgeWorkspace, JUDGE_WORKSPACE_ID } from '@attune/database';
import { redirect } from 'next/navigation';

import { establishJudgeSession } from '../../../lib/auth/session';

export const dynamic = 'force-dynamic';

function accessCodeFrom(form: FormData): string | null {
  const value = form.get('accessCode');
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return null;
  return value;
}

export async function POST(request: Request) {
  const accessCode = accessCodeFrom(await request.formData());
  if (!accessCode || !(await establishJudgeSession(accessCode))) {
    redirect('/judge?error=invalid-code');
  }
  await ensureJudgeWorkspace();
  redirect(`/workspace/${encodeURIComponent(JUDGE_WORKSPACE_ID)}`);
}
