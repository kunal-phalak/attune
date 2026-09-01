export interface ViewportInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type OverlayPanel = 'comments' | 'items' | 'constraints' | 'history' | null;

const HEADER_INSET = 64;
const PANEL_INSET = 368;

export function viewportInsetsFor(panel: OverlayPanel): ViewportInsets {
  return {
    top: HEADER_INSET,
    right: panel === 'constraints' || panel === 'history' ? PANEL_INSET : 0,
    bottom: 0,
    left: panel === 'comments' || panel === 'items' ? PANEL_INSET : 0,
  };
}
