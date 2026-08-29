import { AttuneDomainProof } from '../components/attune-domain-proof';
import { AttuneWebMcp } from '../components/attune-webmcp';

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow">Agent-native physical specification</p>
        <h1>
          Create what
          <br />
          doesn&apos;t exist yet.
        </h1>
        <p className="lede">
          Attune turns intent, geometry, manufacturability, and agreement into one executable
          commitment.
        </p>
        <a className="text-link" href="#proof">
          Inspect AT-1042 <span aria-hidden="true">↓</span>
        </a>
      </div>
      <div className="panel-visual" aria-label="A constrained custom equipment panel">
        <span className="visually-hidden">
          AT-1042 equipment panel with four locked mounting holes, two auxiliary holes, and a
          connector slot whose clearance is 8.1 millimeters against a 12 millimeter requirement.
        </span>
        <svg viewBox="0 0 640 420" aria-hidden="true">
          <rect className="sheet" x="58" y="52" width="524" height="288" rx="8" />
          <circle className="lock" cx="96" cy="90" r="12" />
          <circle className="lock" cx="544" cy="90" r="12" />
          <circle className="lock" cx="96" cy="302" r="12" />
          <circle className="lock" cx="544" cy="302" r="12" />
          <circle className="feature" cx="250" cy="196" r="15" />
          <circle className="feature" cx="390" cy="196" r="15" />
          <rect className="conflict" x="469" y="174" width="74" height="44" rx="18" />
          <path className="dimension" d="M469 244v34m74-34v34M469 267h74" />
          <text x="480" y="296">
            8.1 / 12 mm
          </text>
        </svg>
        <div className="scan-line" aria-hidden="true" />
      </div>
    </section>
  );
}

function ExternalRiskProof() {
  return (
    <section className="proof" id="proof">
      <p className="section-index">00 / EXTERNAL RISK FIRST</p>
      <div className="proof-heading">
        <h2>
          Prove the handoff
          <br />
          before the platform.
        </h2>
        <p>
          Attune began with the external handoff. Product work now advances through one
          authoritative manufacturing scenario while the isolated Shopify permission edge stays
          contained.
        </p>
      </div>
      <dl className="status-list">
        <div>
          <dt>Next.js surface</dt>
          <dd>
            <span className="status-dot ready" /> Ready
          </dd>
        </div>
        <div>
          <dt>Attune WebMCP</dt>
          <dd>
            <span className="status-dot ready" /> Contextual tools active
          </dd>
        </div>
        <div>
          <dt>Shopify proof</dt>
          <dd>
            <span className="status-dot waiting" /> read_inventory permission pending
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <AttuneWebMcp />
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="Attune home">
          ATTUNE
        </a>
        <p>P0 / AT-1042</p>
      </header>
      <Hero />
      <ExternalRiskProof />
      <AttuneDomainProof />
      <footer>
        <p>Constrained 2D fabrication is the first domain, not the product boundary.</p>
        <p>ATTUNE / 2026</p>
      </footer>
    </main>
  );
}
