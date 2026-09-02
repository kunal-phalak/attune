'use client';

export function WorkspaceOrientationHud({ right }: { readonly right: number }) {
  return (
    <aside
      className="sketch-orientation-hud"
      style={{ right: `${right}px` }}
      aria-label="Sketch plane XY, top view"
    >
      <span className="sketch-orientation-gizmo" aria-hidden>
        <span className="sketch-axis-y" />
        <span className="sketch-axis-origin" />
        <span className="sketch-axis-x" />

        <span className="sketch-plane">
          <span className="sketch-plane-border is-top" />
          <span className="sketch-plane-border is-left" />
          <span className="sketch-plane-border is-bottom" />
          <span className="sketch-plane-border is-right" />

          <span className="sketch-plane-face">
            <span className="sketch-plane-label">Top</span>
          </span>
        </span>

        <span className="sketch-axis-label is-y">Y</span>
        <span className="sketch-axis-label is-x">X</span>
      </span>
    </aside>
  );
}
