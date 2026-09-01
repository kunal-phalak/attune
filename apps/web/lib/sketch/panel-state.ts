import type { OverlayPanel } from './viewport-insets';

export type EditorTool = 'select' | 'sketch' | Exclude<OverlayPanel, null>;

export function panelForTool(tool: EditorTool): OverlayPanel {
  return tool === 'comments' || tool === 'items' || tool === 'constraints' || tool === 'history'
    ? tool
    : null;
}

export function toggleEditorTool(current: EditorTool, requested: EditorTool): EditorTool {
  return current === requested ? 'select' : requested;
}

export function panelSide(panel: OverlayPanel): 'left' | 'right' | null {
  if (panel === 'comments' || panel === 'items') return 'left';
  if (panel === 'constraints' || panel === 'history') return 'right';
  return null;
}
