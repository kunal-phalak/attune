import { ShopifyIntegrationError } from '@attune/shopify';
import { NextResponse } from 'next/server';

import { isAttuneCommandError } from './attune-runtime';

const SHOPIFY_ERROR_CODES = new Set([
  'MISSING_CONFIGURATION',
  'ADMIN_AUTH_FAILED',
  'MISSING_ADMIN_SCOPES',
  'GRAPHQL_FAILED',
  'CONFORMANCE_FAILED',
  'STOREFRONT_TIMEOUT',
]);

function shopifyError(error: unknown) {
  if (error instanceof ShopifyIntegrationError) return error;
  if (typeof error !== 'object' || error === null) return undefined;
  const code = Reflect.get(error, 'code');
  const message = Reflect.get(error, 'message');
  if (
    Reflect.get(error, 'name') !== 'ShopifyIntegrationError' ||
    typeof code !== 'string' ||
    !SHOPIFY_ERROR_CODES.has(code) ||
    typeof message !== 'string'
  ) {
    return undefined;
  }
  return { code, message, retryable: Reflect.get(error, 'retryable') === true };
}

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
          semanticRefs: error.changedEntities,
          latestVersions: error.latestVersions,
          whatChanged: error.message,
          canRetry: error.canRetry,
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

  const integrationError = shopifyError(error);
  if (integrationError) {
    return NextResponse.json(
      {
        error: {
          code: integrationError.code,
          message: integrationError.message,
          retryable: integrationError.retryable,
        },
      },
      { status: integrationError.retryable ? 503 : 424 },
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
