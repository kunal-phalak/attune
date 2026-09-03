export function MechanicalPreview({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div
      className={`mechanical-preview${compact ? ' is-compact' : ''}`}
      aria-label="A rendered constrained mechanical design"
    >
      <svg viewBox="0 0 720 500" aria-labelledby="mechanical-preview-title">
        <title id="mechanical-preview-title">Manufacturing-ready aluminium panel design</title>
        <defs>
          <pattern
            id={`mechanical-grid-${compact ? 'compact' : 'full'}`}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.09"
              strokeWidth="1"
            />
          </pattern>
          <linearGradient
            id={`panel-metal-${compact ? 'compact' : 'full'}`}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0" stopColor="#f8f8f6" />
            <stop offset="1" stopColor="#dfe3e8" />
          </linearGradient>
        </defs>
        <rect
          className="mechanical-grid"
          x="0"
          y="0"
          width="720"
          height="500"
          fill={`url(#mechanical-grid-${compact ? 'compact' : 'full'})`}
        />
        <g className="mechanical-dimensions">
          <path d="M140 86V54M580 86V54M140 62H580M140 56v12M580 56v12" />
          <text x="340" y="50">
            320 mm
          </text>
          <path d="M111 112H79M111 388H79M88 112V388M82 112h12M82 388h12" />
          <text x="70" y="272" transform="rotate(-90 70 272)">
            200 mm
          </text>
        </g>
        <g className="mechanical-part">
          <rect
            x="140"
            y="112"
            width="440"
            height="276"
            rx="12"
            fill={`url(#panel-metal-${compact ? 'compact' : 'full'})`}
          />
          <rect x="140" y="112" width="440" height="276" rx="12" />
          <circle cx="177" cy="149" r="9" />
          <circle cx="543" cy="149" r="9" />
          <circle cx="177" cy="351" r="9" />
          <circle cx="543" cy="351" r="9" />
          <circle cx="278" cy="240" r="24" />
          <circle cx="442" cy="240" r="24" />
          <rect x="474" y="309" width="68" height="30" rx="8" />
          <path d="M217 302h130M217 314h130M217 326h130M217 338h130" />
        </g>
        <g className="mechanical-callout">
          <circle cx="508" cy="324" r="4" />
          <path d="M512 324h82l28-32" />
          <rect x="590" y="242" width="108" height="49" rx="7" />
          <text x="604" y="262">
            Slot clearance
          </text>
          <text x="604" y="279">
            8.1 mm · pass
          </text>
        </g>
        <g className="mechanical-origin">
          <path d="M125 404h42M146 383v42" />
          <circle cx="146" cy="404" r="3" />
          <text x="174" y="411">
            Revision r7
          </text>
        </g>
      </svg>
      <div className="mechanical-preview-meta">
        <span>Aluminium 6061</span>
        <span>3 mm</span>
        <strong>Fit verified</strong>
      </div>
    </div>
  );
}
