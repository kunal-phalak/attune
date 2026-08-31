export { databaseConfigured, getDatabase } from './client';
export {
  activeDelegationForWorkspace,
  currentFrozenRevision,
  ensureAuthenticatedUser,
  ensureJudgeWorkspace,
  executePersistedCommand,
  finishExternalMaterialization,
  identityForLiveblocksRoom,
  identityForWorkspace,
  JUDGE_AUTH_USER_ID,
  JUDGE_USER_ID,
  JUDGE_WORKSPACE_ID,
  listProjectsForUser,
  readWorkspaceBundle,
  resetJudgeWorkspace,
  reserveExternalMaterialization,
  usersForLiveblocksRoom,
  workspaceRoles,
} from './repository';
export type {
  ExecutePersistedCommandInput,
  ExternalMaterializationInput,
  ExternalMaterializationReservation,
  WorkspaceBundle,
  WorkspaceIdentity,
} from './repository';
export * as schema from './schema';
