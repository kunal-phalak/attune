'use client';

export function WorkspaceOrientationHud({
  right,
}: {
  readonly right: number;
}) {
  return (
    <aside
      className="sketch-orientation-hud"
      style={{ right }}
      aria-label="Sketch plane XY, top view"
    >
      <svg
        className="sketch-orientation-gizmo"
        viewBox="0 0 26 28"
        preserveAspectRatio="xMinYMin meet"
        aria-hidden
      >
        {/* Axes */}
        <rect
          className="sketch-axis-y"
          x="1"
          y="6"
          width="1"
          height="19"
        />

        <rect
          className="sketch-axis-x"
          x="2"
          y="25"
          width="19"
          height="1"
        />

        {/* Top face */}
        <g className="sketch-plane">
          {/* Main face */}
          <rect
            className="sketch-plane-face"
            x="4"
            y="10"
            width="13"
            height="13"
          />

          {/* Visible face edges */}
          <rect
            className="sketch-face-edge"
            x="4"
            y="8"
            width="13"
            height="2"
          />

          <rect
            className="sketch-face-edge"
            x="2"
            y="10"
            width="2"
            height="13"
          />

          <rect
            className="sketch-face-edge"
            x="17"
            y="10"
            width="2"
            height="13"
          />

          <rect
            className="sketch-face-edge"
            x="4"
            y="23"
            width="13"
            height="2"
          />

          <text
            className="sketch-plane-label"
            x="10.5"
            y="16.5"
            textAnchor="middle"
            dominantBaseline="central"
          >
            Top
          </text>
        </g>

        {/* Origin goes last so the joint is clean */}
        <rect
          className="sketch-axis-origin"
          x="1"
          y="25"
          width="1"
          height="1"
        />

        <text
          className="sketch-axis-label sketch-axis-label-y"
          x="0"
          y="0"
          dominantBaseline="hanging"
        >
          Y
        </text>

        <text
          className="sketch-axis-label sketch-axis-label-x"
          x="22"
          y="23"
          dominantBaseline="hanging"
        >
          X
        </text>
      </svg>
    </aside>
  );
}