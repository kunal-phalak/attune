import { describe, expect, it } from 'vitest';

import { viewportInsetsFor } from './viewport-insets';

describe('viewport safe insets', () => {
  it.each([
    ['no panels', { leftPanel: null, rightPanel: null }, 72, 72],
    ['left panel', { leftPanel: 'items', rightPanel: null }, 368, 72],
    ['right panel', { leftPanel: null, rightPanel: 'history' }, 72, 368],
    ['both panels', { leftPanel: 'comments', rightPanel: 'constraints' }, 368, 368],
  ] as const)('derives independent HUD clearance for %s', (_label, panels, left, right) => {
    expect(viewportInsetsFor(panels)).toEqual({ top: 68, right, bottom: 12, left });
  });
});
