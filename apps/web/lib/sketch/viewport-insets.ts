import { EDITOR_CHROME, EDITOR_ISLAND_WIDTH, EDITOR_LABELED_ISLAND_WIDTH } from './editor-chrome';
import type { EditorPanelState } from './panel-state';

export interface ViewportInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

function hudInset(panelOpen: boolean, showLabels: boolean, panelWidth: number): number {
  const islandWidth = showLabels ? EDITOR_LABELED_ISLAND_WIDTH : EDITOR_ISLAND_WIDTH;
  return (
    EDITOR_CHROME.viewportGap +
    (panelOpen ? panelWidth + EDITOR_CHROME.panelIslandGap : 0) +
    islandWidth +
    EDITOR_CHROME.hudSafeGap
  );
}

export function viewportInsetsFor(
  panels: EditorPanelState,
  showLabels = true,
  panelWidths: { readonly left: number; readonly right: number } = {
    left: EDITOR_CHROME.panelWidth,
    right: EDITOR_CHROME.panelWidth,
  },
): ViewportInsets {
  return {
    top: EDITOR_CHROME.headerHeight + EDITOR_CHROME.viewportGap,
    right: hudInset(panels.rightPanel !== null, showLabels, panelWidths.right),
    bottom: EDITOR_CHROME.viewportGap,
    left: hudInset(panels.leftPanel !== null, showLabels, panelWidths.left),
  };
}
