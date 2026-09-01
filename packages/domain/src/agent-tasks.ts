import type { SketchBounds } from './sketch/geometry';

export type AgentTaskStatus = 'active' | 'waiting' | 'completed' | 'cancelled';

export interface AgentTask {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly title: string;
  readonly targetGroupIds: readonly string[];
  readonly region?: SketchBounds;
  readonly status: AgentTaskStatus;
  readonly message?: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export type AgentTaskRealtimeUpdate =
  | { readonly type: 'task_started'; readonly task: AgentTask }
  | { readonly type: 'task_updated'; readonly task: AgentTask }
  | {
      readonly type: 'human_intervention';
      readonly taskId: string;
      readonly workspaceSeq: number;
      readonly semanticRefs: readonly string[];
    }
  | { readonly type: 'task_completed'; readonly task: AgentTask };

/** Coordination transport only; command authorization remains in the command bus. */
export interface AgentTaskRealtimeSink {
  publish(update: AgentTaskRealtimeUpdate): Promise<void>;
}

export function beginAgentTask(
  input: Omit<AgentTask, 'status' | 'startedAt' | 'updatedAt' | 'completedAt'>,
  now: string,
): AgentTask {
  return { ...input, status: 'active', startedAt: now, updatedAt: now, completedAt: null };
}

export function updateAgentTask(
  task: AgentTask,
  update: Pick<AgentTask, 'status'> & { readonly message?: string },
  now: string,
): AgentTask {
  return {
    ...task,
    ...update,
    updatedAt: now,
    completedAt: update.status === 'completed' ? now : task.completedAt,
  };
}

export function completeAgentTask(task: AgentTask, now: string, message?: string): AgentTask {
  return updateAgentTask(task, { status: 'completed', ...(message ? { message } : {}) }, now);
}
