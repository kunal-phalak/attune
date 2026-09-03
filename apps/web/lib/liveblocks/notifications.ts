export function attuneActivityNotification(input: {
  readonly userId: string;
  readonly roomId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly title: string;
  readonly description: string;
  readonly actorId?: string;
  readonly route?: string;
}) {
  return {
    userId: input.userId,
    roomId: input.roomId,
    kind: '$attuneActivity' as const,
    subjectId: input.subjectId,
    activityData: {
      title: input.title,
      description: input.description,
      workspaceId: input.workspaceId,
      ...(input.route ? { route: input.route } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
    },
  };
}
