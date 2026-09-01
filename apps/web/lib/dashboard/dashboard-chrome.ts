import type { CSSProperties } from 'react';

export const DASHBOARD_CHROME = {
  sidebarWidth: 232,
  sidebarPadding: 14,
  navigationItemHeight: 34,
  searchHeight: 32,
  contentMaxWidth: 1120,
  contentStartInset: 40,
  pageHeaderHeight: 52,
  projectCardGap: 20,
  projectCardWidth: 282,
  thumbnailAspect: '16 / 9',
  cardMetadataPadding: 14,
  motionDuration: 180,
  motionEase: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

export const dashboardChromeCssVariables: CSSProperties &
  Record<`--dashboard-${string}` | '--sidebar-width', string> = {
  '--sidebar-width': `${DASHBOARD_CHROME.sidebarWidth}px`,
  '--dashboard-sidebar-width': `${DASHBOARD_CHROME.sidebarWidth}px`,
  '--dashboard-sidebar-padding': `${DASHBOARD_CHROME.sidebarPadding}px`,
  '--dashboard-nav-height': `${DASHBOARD_CHROME.navigationItemHeight}px`,
  '--dashboard-search-height': `${DASHBOARD_CHROME.searchHeight}px`,
  '--dashboard-content-max': `${DASHBOARD_CHROME.contentMaxWidth}px`,
  '--dashboard-content-inset': `${DASHBOARD_CHROME.contentStartInset}px`,
  '--dashboard-page-header-height': `${DASHBOARD_CHROME.pageHeaderHeight}px`,
  '--dashboard-card-gap': `${DASHBOARD_CHROME.projectCardGap}px`,
  '--dashboard-card-width': `${DASHBOARD_CHROME.projectCardWidth}px`,
  '--dashboard-thumbnail-aspect': DASHBOARD_CHROME.thumbnailAspect,
  '--dashboard-card-meta-padding': `${DASHBOARD_CHROME.cardMetadataPadding}px`,
  '--dashboard-motion-duration': `${DASHBOARD_CHROME.motionDuration}ms`,
  '--dashboard-motion-ease': DASHBOARD_CHROME.motionEase,
} as const;
