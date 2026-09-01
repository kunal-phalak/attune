import { describe, expect, it } from 'vitest';

import { EDITOR_CURSOR_MAP, editorCursorFor } from './editor-cursors';

describe('editor cursor map', () => {
  it('centralizes every supported editor interaction mode', () => {
    expect(Object.keys(EDITOR_CURSOR_MAP)).toEqual([
      'select',
      'pan',
      'draw',
      'comment',
      'constraint',
    ]);
  });

  it('keeps the drawing interaction point on the cursor tip', () => {
    expect(editorCursorFor('draw')).toMatchObject({
      cssCursor: 'crosshair',
      hotspot: { x: 8, y: 8 },
      semanticName: 'Draw',
    });
  });
});
