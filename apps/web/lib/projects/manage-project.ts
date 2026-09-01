export interface ManagedProjectDeletion {
  readonly projectId: string;
  readonly workspaceIds: readonly string[];
  readonly roomIds: readonly string[];
}

export interface ProjectDeletionDependencies {
  persistAuthorizedDeletion(input: {
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<ManagedProjectDeletion>;
  deleteRoom(roomId: string): Promise<void>;
}

export async function deleteManagedProject(
  dependencies: ProjectDeletionDependencies,
  input: { readonly userId: string; readonly workspaceId: string },
): Promise<ManagedProjectDeletion & { readonly roomCleanupFailures: number }> {
  const deleted = await dependencies.persistAuthorizedDeletion(input);
  const cleanup = await Promise.allSettled(
    deleted.roomIds.map((roomId) => dependencies.deleteRoom(roomId)),
  );
  return {
    ...deleted,
    roomCleanupFailures: cleanup.filter(({ status }) => status === 'rejected').length,
  };
}
