import { NextResponse } from 'next/server';

import { isAttuneCommandError } from './attune-runtime';

export function attuneErrorResponse(error: unknown): NextResponse {
  if (isAttuneCommandError(error)) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }

  if (error instanceof TypeError) {
    return NextResponse.json(
      { error: { code: 'INVALID_COMMAND', message: error.message } },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: { code: 'COMMAND_FAILED', message: 'The authoritative command could not be applied.' },
    },
    { status: 500 },
  );
}

export function noStoreJson(value: unknown): NextResponse {
  return NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
}
