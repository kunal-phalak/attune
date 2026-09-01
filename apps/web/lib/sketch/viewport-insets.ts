import { EDITOR_CHROME, EDITOR_ISLAND_WIDTH } from './editor-chrome';
import type { EditorPanelState } from './panel-state';

export interface ViewportInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const HUD_ISLAND_INSET = EDITOR_CHROME.viewportGap + EDITOR_ISLAND_WIDTH + EDITOR_CHROME.hudSafeGap;
const HUD_PANEL_INSET =
  EDITOR_CHROME.viewportGap +
  EDITOR_CHROME.panelWidth +
  EDITOR_CHROME.panelIslandGap +
  EDITOR_ISLAND_WIDTH +
  EDITOR_CHROME.hudSafeGap;

export function viewportInsetsFor(panels: EditorPanelState): ViewportInsets {
  return {
    top: EDITOR_CHROME.headerHeight + EDITOR_CHROME.viewportGap,
    right: panels.rightPanel ? HUD_PANEL_INSET : HUD_ISLAND_INSET,
    bottom: EDITOR_CHROME.viewportGap,
    left: panels.leftPanel ? HUD_PANEL_INSET : HUD_ISLAND_INSET,
  };
}
