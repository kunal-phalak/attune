'use client';

import { Surface } from '@cloudflare/kumo/components/surface';

export function WorkspaceOrientationHud({
  right,
  gridStep,
}: {
  readonly right: number;
  readonly gridStep: number;
}) {
  return (
    <Surface
      render={<aside />}
      className="sketch-orientation-hud"
      style={{ right: `${right}px` }}
      aria-label="Sketch plane XY, top view"
    >
      <span className="sketch-orientation-gizmo" aria-hidden>
        <span className="sketch-axis is-y">Y</span>
        <span className="sketch-plane-face">XY</span>
        <span className="sketch-axis-origin" />
        <span className="sketch-axis is-x">X</span>
      </span>
      <span className="sketch-orientation-copy">
        <strong>Top</strong>
        <small>{gridStep} mm</small>
      </span>
    </Surface>
  );
}
