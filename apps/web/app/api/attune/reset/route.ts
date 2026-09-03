import { JUDGE_WORKSPACE_ID, resetJudgeWorkspace } from '@attune/database';
import { NextResponse } from 'next/server';

import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { inspectForHuman } from '../../../../lib/attune-runtime';
import { currentAttuneUser } from '../../../../lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await currentAttuneUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to reset this workspace.' } },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!user.judge) {
      return NextResponse.json(
        {
          error: {
            code: 'JUDGE_ACCESS_REQUIRED',
            message: 'Only the authorized review session can reset this workspace.',
          },
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    await resetJudgeWorkspace();
    return noStoreJson(await inspectForHuman(JUDGE_WORKSPACE_ID));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
