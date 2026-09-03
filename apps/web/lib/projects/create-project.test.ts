import { describe, expect, it, vi } from 'vitest';

import { createSketchProjectPlan, provisionSketchProject } from './create-project';

describe('project creation', () => {
  it('creates stable blank and spoke project plans', () => {
    expect(createSketchProjectPlan('blank', () => 'abc').name).toBe('Untitled sketch');
    const spoke = createSketchProjectPlan('spoke', () => 'def');
    expect(spoke.name).toBe('Straight-spoke wheel');
    expect(spoke.roomId).toBe('attune:workspace:def');
  });

  it('creates the room and document before persisting the Neon project', async () => {
    const order: string[] = [];
    const dependencies = {
      createRoom: vi.fn(async () => void order.push('room')),
      initializeDocument: vi.fn(async () => void order.push('document')),
      persistProject: vi.fn(async () => void order.push('database')),
      deleteRoom: vi.fn(async () => undefined),
    };
    const plan = createSketchProjectPlan('spoke', () => 'ordered');

    await expect(provisionSketchProject(dependencies, plan)).resolves.toBe(plan);
    expect(order).toEqual(['room', 'document', 'database']);
    expect(dependencies.deleteRoom).not.toHaveBeenCalled();
  });

  it('removes a provisioned room when persistence fails', async () => {
    const dependencies = {
      createRoom: vi.fn(async () => undefined),
      initializeDocument: vi.fn(async () => undefined),
      persistProject: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
      deleteRoom: vi.fn(async () => undefined),
    };
    const plan = createSketchProjectPlan('blank', () => 'cleanup');

    await expect(provisionSketchProject(dependencies, plan)).rejects.toThrow(
      'database unavailable',
    );
    expect(dependencies.deleteRoom).toHaveBeenCalledWith(plan.roomId);
  });
});
