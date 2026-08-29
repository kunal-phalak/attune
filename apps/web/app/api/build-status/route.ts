import { NextResponse } from 'next/server';

import { getFoundationBuildStatus } from '../../../lib/foundation-status';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getFoundationBuildStatus(process.env), {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
