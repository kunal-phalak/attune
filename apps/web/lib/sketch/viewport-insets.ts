import { EDITOR_CHROME, EDITOR_ISLAND_WIDTH, EDITOR_LABELED_ISLAND_WIDTH } from './editor-chrome';
import type { EditorPanelState } from './panel-state';

export interface ViewportInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

function hudInset(panelOpen: boolean, showLabels: boolean): number {
  const islandWidth = showLabels ? EDITOR_LABELED_ISLAND_WIDTH : EDITOR_ISLAND_WIDTH;
  return (
    EDITOR_CHROME.viewportGap +
    (panelOpen ? EDITOR_CHROME.panelWidth + EDITOR_CHROME.panelIslandGap : 0) +
    islandWidth +
    EDITOR_CHROME.hudSafeGap
  );
}

export function viewportInsetsFor(panels: EditorPanelState, showLabels = true): ViewportInsets {
  return {
    top: EDITOR_CHROME.headerHeight + EDITOR_CHROME.viewportGap,
    right: hudInset(panels.rightPanel !== null, showLabels),
    bottom: EDITOR_CHROME.viewportGap,
    left: hudInset(panels.leftPanel !== null, showLabels),
  };
}
