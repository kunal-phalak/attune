import { LinkButton } from '@cloudflare/kumo/components/button';
import Link from 'next/link';

import { MechanicalPreview } from '../components/mechanical-preview';
import { RevealText } from '../components/reveal-text';

function Hero() {
  return (
    <section className="landing-hero" id="top">
      <RevealText className="landing-hero-copy">
        <p className="landing-kicker t-stagger-line">Attune</p>
        <h1 className="t-stagger-line t-stagger-line--2">
          <span>Design it.</span>
          <span>Find who can make it.</span>
          <span>Make it real.</span>
        </h1>
        <p className="landing-lede t-stagger-line t-stagger-line--2">
          A shared workspace for designing custom parts, matching them to capable makers, and
          ordering the exact revision you approved.
        </p>
        <div className="landing-actions t-stagger-line t-stagger-line--2">
          <LinkButton href="/dashboard" variant="primary">
            Start designing
          </LinkButton>
          <LinkButton href="/sign-in" variant="secondary">
            Sign in
          </LinkButton>
        </div>
      </RevealText>
      <div className="landing-hero-visual">
        <MechanicalPreview />
      </div>
    </section>
  );
}

function ProductSystem() {
  return (
    <section className="landing-proof" id="system">
      <article>
        <span>01</span>
        <h2>Create together</h2>
        <p>Shape a real design with people and agents in one shared workspace.</p>
      </article>
      <article>
        <span>02</span>
        <h2>Find a capable maker</h2>
        <p>Compare the design directly with a maker’s declared process limits.</p>
      </article>
      <article>
        <span>03</span>
        <h2>Order the exact revision</h2>
        <p>Carry the accepted revision and specification hash into checkout.</p>
      </article>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <header className="landing-masthead">
        <a className="landing-wordmark" href="#top" aria-label="Attune home">
          Attune
        </a>
        <nav className="landing-nav" aria-label="Primary navigation">
          <a href="#system">How it works</a>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>
      <Hero />
      <ProductSystem />
      <footer className="landing-footer">
        <p>From design intent to a verified order.</p>
        <p>Attune / 2026</p>
      </footer>
    </main>
  );
}
