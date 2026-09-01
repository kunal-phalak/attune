import { describe, expect, it } from 'vitest';

import { CLOSED_EDITOR_PANELS, panelSide, toggleEditorPanel } from './panel-state';

describe('editor panel state', () => {
  it('toggles a panel without changing the opposite side', () => {
    const both = toggleEditorPanel(toggleEditorPanel(CLOSED_EDITOR_PANELS, 'items'), 'constraints');

    expect(both).toEqual({ leftPanel: 'items', rightPanel: 'constraints' });
    expect(toggleEditorPanel(both, 'items')).toEqual({
      leftPanel: null,
      rightPanel: 'constraints',
    });
  });

  it('keeps same-side choices mutually exclusive', () => {
    expect(toggleEditorPanel({ leftPanel: 'items', rightPanel: 'history' }, 'comments')).toEqual({
      leftPanel: 'comments',
      rightPanel: 'history',
    });
    expect(
      toggleEditorPanel({ leftPanel: 'comments', rightPanel: 'constraints' }, 'history'),
    ).toEqual({ leftPanel: 'comments', rightPanel: 'history' });
  });

  it('maps panel choices to a stable side', () => {
    expect(panelSide('comments')).toBe('left');
    expect(panelSide('items')).toBe('left');
    expect(panelSide('constraints')).toBe('right');
    expect(panelSide('history')).toBe('right');
  });
});
