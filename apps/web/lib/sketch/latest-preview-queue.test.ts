import { describe, expect, it } from 'vitest';

import { LatestPreviewQueue } from './latest-preview-queue';

describe('latest-target PlaneGCS preview queue', () => {
  it('keeps only the newest pointer target while one solve is running', () => {
    const dispatched: number[] = [];
    const accepted: number[] = [];
    const queue = new LatestPreviewQueue(
      (request: { dragSessionId: string; generation: number }) =>
        dispatched.push(request.generation),
      (result: { dragSessionId: string; generation: number }) => accepted.push(result.generation),
    );
    queue.enqueue({ dragSessionId: 'drag:1', generation: 52 });
    for (let generation = 53; generation <= 61; generation += 1) {
      queue.enqueue({ dragSessionId: 'drag:1', generation });
    }
    expect(dispatched).toEqual([52]);
    queue.resolve({ dragSessionId: 'drag:1', generation: 52 });
    expect(dispatched).toEqual([52, 61]);
    expect(accepted).toEqual([]);
    queue.resolve({ dragSessionId: 'drag:1', generation: 61 });
    expect(accepted).toEqual([61]);
  });

  it('rejects stale results from a cancelled drag session', () => {
    const accepted: string[] = [];
    const queue = new LatestPreviewQueue(
      () => undefined,
      (result: { dragSessionId: string; generation: number }) =>
        accepted.push(result.dragSessionId),
    );
    queue.enqueue({ dragSessionId: 'old', generation: 1 });
    queue.cancel('old');
    queue.enqueue({ dragSessionId: 'new', generation: 1 });
    queue.resolve({ dragSessionId: 'old', generation: 1 });
    queue.resolve({ dragSessionId: 'new', generation: 1 });
    expect(accepted).toEqual(['new']);
  });
});
