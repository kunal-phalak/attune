import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  ensureAuthenticatedUser,
  identityForWorkspace,
  JUDGE_USER_ID,
  type WorkspaceIdentity,
} from '@attune/database';
import type { AttuneRole } from '@attune/domain';
import { cookies } from 'next/headers';

import { judgeAccessCodeConfigured, judgeAccessCodeMatches } from './judge-access';
import { getNeonAuth, neonAuthConfigured } from './neon';

const JUDGE_COOKIE = 'attune_judge_session';
const JUDGE_SESSION_SECONDS = 12 * 60 * 60;

interface JudgeSessionPayload {
  readonly kind: 'judge';
  readonly expiresAt: number;
}

interface AuthUser {
  readonly id: string;
  readonly email?: string | null;
  readonly name?: string | null;
}

function sessionSecret(): string {
  const secret = process.env.ATTUNE_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ATTUNE_SESSION_SECRET must contain at least 32 characters.');
  }
  return secret;
}

function signature(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function judgeSessionValue(payload: JudgeSessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

function parseJudgeSession(value: string | undefined): JudgeSessionPayload | null {
  if (!value) return null;
  const [encoded, suppliedSignature] = value.split('.');
  if (!encoded || !suppliedSignature) return null;
  const expected = Buffer.from(signature(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (Reflect.get(parsed, 'kind') !== 'judge') return null;
    const expiresAt = Reflect.get(parsed, 'expiresAt');
    if (typeof expiresAt !== 'number' || expiresAt <= Date.now()) return null;
    return { kind: 'judge', expiresAt };
  } catch {
    return null;
  }
}

export function judgeCredentialConfigured(): boolean {
  return (
    judgeAccessCodeConfigured() &&
    typeof process.env.ATTUNE_SESSION_SECRET === 'string' &&
    process.env.ATTUNE_SESSION_SECRET.length >= 32
  );
}

export async function establishJudgeSession(accessCode: string): Promise<boolean> {
  if (!judgeCredentialConfigured() || !judgeAccessCodeMatches(accessCode)) return false;
  const expiresAt = Date.now() + JUDGE_SESSION_SECONDS * 1000;
  const cookieStore = await cookies();
  cookieStore.set(JUDGE_COOKIE, judgeSessionValue({ kind: 'judge', expiresAt }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: JUDGE_SESSION_SECONDS,
  });
  return true;
}

async function neonSessionUser(): Promise<AuthUser | null> {
  if (!neonAuthConfigured()) return null;
  const response = await getNeonAuth().getSession();
  const data = response.data as { readonly user?: AuthUser } | null | undefined;
  return data?.user ?? null;
}

export async function currentAttuneUser(): Promise<{
  readonly userId: string;
  readonly principalId: string;
  readonly displayName: string;
  readonly judge: boolean;
} | null> {
  const cookieStore = await cookies();
  const judge = parseJudgeSession(cookieStore.get(JUDGE_COOKIE)?.value);
  if (judge) {
    return {
      userId: JUDGE_USER_ID,
      principalId: `judge:${JUDGE_USER_ID}`,
      displayName: 'Challenge Judge',
      judge: true,
    };
  }

  const authUser = await neonSessionUser();
  if (!authUser) return null;
  const userId = await ensureAuthenticatedUser({
    authUserId: authUser.id,
    email: authUser.email ?? undefined,
    displayName: authUser.name || authUser.email || 'Attune member',
  });
  return {
    userId,
    principalId: `user:${authUser.id}`,
    displayName: authUser.name || authUser.email || 'Attune member',
    judge: false,
  };
}

export async function requireWorkspaceIdentity(
  workspaceId: string,
  role: AttuneRole,
): Promise<WorkspaceIdentity> {
  const user = await currentAttuneUser();
  if (!user) throw new Error('AUTHENTICATION_REQUIRED');
  const identity = await identityForWorkspace(workspaceId, user.userId, user.principalId);
  if (!identity || !identity.roles.includes(role)) throw new Error('WORKSPACE_ROLE_REQUIRED');
  return identity;
}
