import { describe, expect, it } from 'vitest';

import { panelForTool, panelSide, toggleEditorTool } from './panel-state';

describe('editor panel state', () => {
  it('opens one panel and returns to select when toggled closed', () => {
    expect(toggleEditorTool('select', 'items')).toBe('items');
    expect(toggleEditorTool('items', 'items')).toBe('select');
  });

  it('switches directly between left and right contextual panels', () => {
    expect(toggleEditorTool('comments', 'history')).toBe('history');
    expect(panelSide(panelForTool('comments'))).toBe('left');
    expect(panelSide(panelForTool('history'))).toBe('right');
  });

  it('does not reserve a panel for direct canvas tools', () => {
    expect(panelForTool('select')).toBeNull();
    expect(panelForTool('sketch')).toBeNull();
  });
});
