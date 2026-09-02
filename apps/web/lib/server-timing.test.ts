import { describe, expect, it, vi } from 'vitest';

import { measureServerPhase, ServerTimingTrace } from './server-timing';

describe('ServerTimingTrace', () => {
  it('emits named phases and applies them to a response', async () => {
    const timing = new ServerTimingTrace();
    const operation = vi.fn(async () => 'ready');

    await expect(measureServerPhase(timing.record, 'neon workspace load', operation)).resolves.toBe(
      'ready',
    );
    const response = timing.apply(Response.json({ ok: true }));

    expect(operation).toHaveBeenCalledTimes(1);
    expect(response.headers.get('Server-Timing')).toMatch(/^neon_workspace_load;dur=\d+\.\d$/);
  });
});
