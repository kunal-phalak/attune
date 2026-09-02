import { createAt1042Workspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { capabilityTransition } from './transitions';

describe('capability transition identity', () => {
  it('stays unique when separate workspaces advance to the same sequence', () => {
    const before = createAt1042Workspace();
    const after = { ...before, workspaceSeq: 1 as const };

    const first = capabilityTransition(before, after, 'receipt:workspace-a:1');
    const second = capabilityTransition(before, after, 'receipt:workspace-b:1');

    expect(first.transitionId).not.toBe(second.transitionId);
    expect(first.transitionId).toContain(first.receiptId);
    expect(second.transitionId).toContain(second.receiptId);
  });
});
