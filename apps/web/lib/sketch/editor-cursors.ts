import type { ComponentType, CSSProperties } from 'react';

import { AppIcons } from '../../components/ui/app-icons';

export type EditorCursorMode = 'select' | 'pan' | 'draw' | 'comment' | 'constraint';

export interface EditorCursorDefinition {
  readonly component: ComponentType<{ readonly size?: number; readonly className?: string }>;
  readonly cssCursor: CSSProperties['cursor'];
  readonly hotspot: { readonly x: number; readonly y: number };
  readonly rotation: number;
  readonly semanticName: string;
}

export const EDITOR_CURSOR_MAP = {
  select: {
    component: AppIcons.Select,
    cssCursor: 'default',
    hotspot: { x: 0, y: 0 },
    rotation: 0,
    semanticName: 'Select',
  },
  pan: {
    component: AppIcons.Pan,
    cssCursor: 'grabbing',
    hotspot: { x: 12, y: 12 },
    rotation: 0,
    semanticName: 'Pan',
  },
  draw: {
    component: AppIcons.Sketch,
    cssCursor: 'crosshair',
    hotspot: { x: 8, y: 8 },
    rotation: -45,
    semanticName: 'Draw',
  },
  comment: {
    component: AppIcons.Comments,
    cssCursor: 'cell',
    hotspot: { x: 8, y: 8 },
    rotation: 0,
    semanticName: 'Comment',
  },
  constraint: {
    component: AppIcons.SketchConstraints,
    cssCursor: 'crosshair',
    hotspot: { x: 8, y: 8 },
    rotation: 0,
    semanticName: 'Constraint',
  },
} satisfies Record<EditorCursorMode, EditorCursorDefinition>;

export function editorCursorFor(mode: EditorCursorMode): EditorCursorDefinition {
  return EDITOR_CURSOR_MAP[mode];
}
