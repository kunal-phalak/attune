export type CanvasTool = 'select' | 'sketch';
export type LeftPanel = 'items' | 'comments';
export type RightPanel = 'constraints' | 'history';
export type EditorPanel = LeftPanel | RightPanel;

export interface EditorPanelState {
  readonly leftPanel: LeftPanel | null;
  readonly rightPanel: RightPanel | null;
}

export const CLOSED_EDITOR_PANELS: EditorPanelState = {
  leftPanel: null,
  rightPanel: null,
};

export function panelSide(panel: EditorPanel): 'left' | 'right' {
  return panel === 'comments' || panel === 'items' ? 'left' : 'right';
}

export function toggleEditorPanel(
  current: EditorPanelState,
  requested: EditorPanel,
): EditorPanelState {
  if (requested === 'comments' || requested === 'items') {
    return {
      ...current,
      leftPanel: current.leftPanel === requested ? null : requested,
    };
  }
  return {
    ...current,
    rightPanel: current.rightPanel === requested ? null : requested,
  };
}
