import { ensureJudgeWorkspace, JUDGE_WORKSPACE_ID } from '@attune/database';
import { NextResponse } from 'next/server';

import { establishJudgeSession } from '../../../lib/auth/session';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Expires: '0',
  Pragma: 'no-cache',
} as const;

function accessCodeFrom(form: FormData): string | null {
  const value = form.get('accessCode');
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return null;
  return value;
}

function noStoreRedirect(request: Request, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, request.url), {
    status: 303,
    headers: NO_STORE_HEADERS,
  });
}

export async function POST(request: Request) {
  const accessCode = accessCodeFrom(await request.formData());
  if (!accessCode || !(await establishJudgeSession(accessCode))) {
    return noStoreRedirect(request, '/judge?error=invalid-code');
  }
  await ensureJudgeWorkspace();
  return noStoreRedirect(request, `/workspace/${encodeURIComponent(JUDGE_WORKSPACE_ID)}`);
}
