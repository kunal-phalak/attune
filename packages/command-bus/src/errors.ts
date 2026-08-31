export type AttuneCommandErrorCode =
  | 'STALE_WORKSPACE'
  | 'STALE_CAPABILITY'
  | 'SPEC_HASH_MISMATCH'
  | 'CAPABILITY_UNAVAILABLE'
  | 'ROLE_MISMATCH'
  | 'ORIGIN_NOT_ALLOWED'
  | 'PRINCIPAL_MISMATCH'
  | 'DELEGATION_REQUIRED'
  | 'DELEGATION_INVALID'
  | 'DELEGATION_EXPIRED'
  | 'DELEGATION_REVOKED'
  | 'DELEGATION_CAPABILITY_DENIED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'COMMAND_CONFLICT';

export class AttuneCommandError extends Error {
  constructor(
    readonly code: AttuneCommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AttuneCommandError';
  }
}
