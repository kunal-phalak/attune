import { describe, expect, it } from 'vitest';

import { viewportInsetsFor } from './viewport-insets';

describe('viewport safe insets', () => {
  it.each([
    ['no panels', { leftPanel: null, rightPanel: null }, 152, 152],
    ['left panel', { leftPanel: 'items', rightPanel: null }, 448, 152],
    ['right panel', { leftPanel: null, rightPanel: 'history' }, 152, 448],
    ['both panels', { leftPanel: 'comments', rightPanel: 'constraints' }, 448, 448],
  ] as const)('derives independent HUD clearance for %s', (_label, panels, left, right) => {
    expect(viewportInsetsFor(panels)).toEqual({ top: 68, right, bottom: 12, left });
  });

  it('returns compact-island clearance when labels are hidden', () => {
    expect(viewportInsetsFor({ leftPanel: 'items', rightPanel: 'history' }, false)).toEqual({
      top: 68,
      right: 368,
      bottom: 12,
      left: 368,
    });
  });
});
