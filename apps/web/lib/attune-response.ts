import { ShopifyIntegrationError } from '@attune/shopify';
import { NextResponse } from 'next/server';

import { isAttuneCommandError } from './attune-runtime';

export function attuneErrorResponse(error: unknown): NextResponse {
  if (error instanceof Error && error.message === 'AUTHENTICATION_REQUIRED') {
    return NextResponse.json(
      { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to access this workspace.' } },
      { status: 401 },
    );
  }

  if (error instanceof Error && error.message === 'WORKSPACE_ROLE_REQUIRED') {
    return NextResponse.json(
      { error: { code: 'WORKSPACE_ROLE_REQUIRED', message: 'This role is not assigned to you.' } },
      { status: 403 },
    );
  }

  if (isAttuneCommandError(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          changedEntities: error.changedEntities,
        },
      },
      { status: error.code === 'DELEGATION_REQUIRED' ? 403 : 409 },
    );
  }

  if (error instanceof TypeError) {
    return NextResponse.json(
      { error: { code: 'INVALID_COMMAND', message: error.message } },
      { status: 400 },
    );
  }

  if (error instanceof ShopifyIntegrationError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
      { status: error.retryable ? 503 : 424 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: 'COMMAND_FAILED',
        message: 'The authoritative command could not be applied.',
      },
    },
    { status: 500 },
  );
}

export function noStoreJson(value: unknown, headers?: HeadersInit): NextResponse {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return NextResponse.json(value, { headers: responseHeaders });
}
