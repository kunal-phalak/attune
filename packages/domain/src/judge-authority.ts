export type JudgeDemoAuthorityContext = 'buyer_demo' | 'provider_demo';

export interface SignedJudgeAuthoritySession {
  readonly sessionId: string;
  readonly principalId: string;
  readonly signed: true;
  readonly allowedContexts: readonly JudgeDemoAuthorityContext[];
  readonly expiresAt: string;
}

/** Server-owned seam; normal workspace roles cannot mint or switch judge authority contexts. */
export interface JudgeAuthoritySessionValidator {
  validateSwitch(input: {
    readonly sessionId: string;
    readonly principalId: string;
    readonly context: JudgeDemoAuthorityContext;
  }): Promise<SignedJudgeAuthoritySession>;
}

export function validateJudgeAuthorityContext(
  session: SignedJudgeAuthoritySession,
  context: JudgeDemoAuthorityContext,
  now: string,
): JudgeDemoAuthorityContext {
  if (!session.signed || Date.parse(session.expiresAt) <= Date.parse(now)) {
    throw new Error('JUDGE_SESSION_REQUIRED');
  }
  if (!session.allowedContexts.includes(context)) throw new Error('JUDGE_AUTHORITY_DENIED');
  return context;
}
