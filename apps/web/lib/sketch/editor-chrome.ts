import type { CSSProperties } from 'react';

export const EDITOR_CHROME = {
  compactIconButton: 30,
  normalIconButton: 34,
  icon: 20,
  islandPadding: 5,
  islandGap: 2,
  panelWidth: 288,
  viewportGap: 12,
  panelIslandGap: 8,
  closeButton: 34,
  headerControlHeight: 34,
  headerHeight: 56,
  panelRadius: 12,
  popupRadius: 12,
  hudSafeGap: 14,
  motionDuration: 180,
  motionEase: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

export const EDITOR_ISLAND_WIDTH =
  EDITOR_CHROME.normalIconButton + EDITOR_CHROME.islandPadding * 2 + 2;

export const editorChromeCssVariables: CSSProperties & Record<`--editor-${string}`, string> = {
  '--editor-compact-control-size': `${EDITOR_CHROME.compactIconButton}px`,
  '--editor-control-size': `${EDITOR_CHROME.normalIconButton}px`,
  '--editor-icon-size': `${EDITOR_CHROME.icon}px`,
  '--editor-island-padding': `${EDITOR_CHROME.islandPadding}px`,
  '--editor-island-gap': `${EDITOR_CHROME.islandGap}px`,
  '--editor-panel-width': `${EDITOR_CHROME.panelWidth}px`,
  '--editor-viewport-gap': `${EDITOR_CHROME.viewportGap}px`,
  '--editor-panel-gap': `${EDITOR_CHROME.panelIslandGap}px`,
  '--editor-close-size': `${EDITOR_CHROME.closeButton}px`,
  '--editor-header-control-height': `${EDITOR_CHROME.headerControlHeight}px`,
  '--editor-header-height': `${EDITOR_CHROME.headerHeight}px`,
  '--editor-panel-radius': `${EDITOR_CHROME.panelRadius}px`,
  '--editor-popup-radius': `${EDITOR_CHROME.popupRadius}px`,
  '--editor-hud-safe-gap': `${EDITOR_CHROME.hudSafeGap}px`,
  '--editor-motion-duration': `${EDITOR_CHROME.motionDuration}ms`,
  '--editor-motion-ease': EDITOR_CHROME.motionEase,
} as const;
