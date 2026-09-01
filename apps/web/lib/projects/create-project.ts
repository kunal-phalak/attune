import type { SketchTemplate } from './library';

export interface SketchProjectPlan {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly roomId: string;
  readonly fileId: string;
  readonly projectCode: string;
  readonly commitmentId: string;
  readonly name: string;
  readonly template: SketchTemplate;
}

export interface ProjectProvisioningDependencies {
  createRoom(plan: SketchProjectPlan): Promise<void>;
  initializeDocument(plan: SketchProjectPlan): Promise<void>;
  persistProject(plan: SketchProjectPlan): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
}

export function createSketchProjectPlan(
  template: SketchTemplate,
  createId: () => string,
): SketchProjectPlan {
  const id = createId();
  const name = template === 'spoke' ? 'Spoke example' : 'Untitled sketch';
  return {
    projectId: `project:${id}`,
    workspaceId: `workspace:${id}`,
    roomId: `attune:workspace:${id}`,
    fileId: `file:${id}`,
    projectCode: `SK-${id.slice(0, 8).toUpperCase()}`,
    commitmentId: `sketch:${id}`,
    name,
    template,
  };
}

export async function provisionSketchProject(
  dependencies: ProjectProvisioningDependencies,
  plan: SketchProjectPlan,
): Promise<SketchProjectPlan> {
  let roomCreated = false;
  try {
    await dependencies.createRoom(plan);
    roomCreated = true;
    await dependencies.initializeDocument(plan);
    await dependencies.persistProject(plan);
    return plan;
  } catch (error) {
    if (roomCreated) {
      try {
        await dependencies.deleteRoom(plan.roomId);
      } catch {
        // Preserve the provisioning failure; a failed cleanup is safe to retry operationally.
      }
    }
    throw error;
  }
}
