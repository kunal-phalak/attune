import Link from 'next/link';

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow">Agent-native physical specification</p>
        <h1>
          Make intent
          <br />
          executable.
        </h1>
        <p className="lede">
          Attune turns custom physical requirements into a shared, manufacturable specification—and
          keeps authority bound to the exact revision people agreed to.
        </p>
        <div className="landing-actions">
          <Link className="primary-link" href="/dashboard">
            Open Attune
          </Link>
          <a className="text-link" href="#system">
            See how it works <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
      <div className="panel-visual" aria-label="A constrained custom equipment panel">
        <span className="visually-hidden">
          AT-1042 equipment panel with four locked mounting holes, two auxiliary holes, and a
          connector slot whose clearance is checked against a manufacturing requirement.
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

function ProductSystem() {
  return (
    <section className="proof" id="system">
      <p className="section-index">01 / ONE AUTHORITATIVE THREAD</p>
      <div className="proof-heading">
        <h2>
          From need
          <br />
          to real execution.
        </h2>
        <p>
          Humans and agents co-create through one semantic command path. Constraints predict
          consequences, frozen revisions preserve commercial intent, and external actions must prove
          the exact specification they executed.
        </p>
      </div>
      <div className="landing-flow" aria-label="Attune product workflow">
        <span>Co-create</span>
        <span>Validate</span>
        <span>Commit</span>
        <span>Execute</span>
        <span>Conform</span>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="Attune home">
          ATTUNE
        </a>
        <nav className="landing-nav" aria-label="Primary navigation">
          <a href="#system">System</a>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>
      <Hero />
      <ProductSystem />
      <footer>
        <p>Constrained 2D fabrication is the first domain, not the product boundary.</p>
        <p>ATTUNE / 2026</p>
      </footer>
    </main>
  );
}
