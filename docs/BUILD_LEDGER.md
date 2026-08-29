# Attune Build Ledger

This ledger distinguishes implementation work from the pre-implementation specification.

## 2026-08-29 — External-risk-first foundation

- Confirmed that the workspace contained only the master build specification.
- Started the minimal pnpm/Vite+ workspace and Next.js application.
- Added a single page-scoped, read-only `inspect_attune_build` WebMCP tool.
- Added an environment contract and Shopify connectivity-spike harness.
- Deliberately did not add Neon, Kumo, judge access, CanvasKit, PlaneGCS, or product
  workspace packages before the Shopify gate.
- Recorded a rules review timestamp only. No legal acknowledgment or agreement flag was
  created or inferred.
- Pinned Vite+ `0.2.7`, its core alias `0.2.7`, bundled Vitest `4.1.10`, Next.js
  `16.3.3`, React `19.2.8`, and pnpm `11.22.0` in the workspace and lockfile.
- `pnpm check` passed with zero errors. Three intentionally non-blocking pre-freeze
  complexity/function-size warnings remain visible for later enforcement.
- `pnpm test` passed: one test file and two tests.
- `vp run build` delegated to `next build` and produced `/` plus
  `/api/build-status` successfully.
- Local smoke verification returned HTTP 200 for both routes. The status endpoint
  reported the eight missing Shopify input names and exposed no credential values.
- `pnpm shopify:spike` stopped safely before network activity because Shopify is not yet
  connected. Deployment and the live spike remain the current external gate.

## 2026-08-29 — Phase-A continuation

- Reframed `docs/PRIOR_WORK.md` strictly as an implementation disclosure: Attune is a
  from-scratch challenge-period implementation without making claims about earlier
  thinking, research, or planning.
- Marked `inspect_attune_build` as a temporary `phase-a-only` imperative tool in its
  title, description, structured result, UI label, and tests.
- Verified the tool in the in-app Chromium browser through the native WebMCP capability.
  The browser discovered and executed the tool registered on `document.modelContext`;
  no deprecated `navigator.modelContext` use exists.
- Added the later-phase capability compiler, human-intervention observation cursor, and
  revocable-authority contract without starting product implementation.
- Added a five-run AT-1042 benchmark protocol and a source-backed product outcome-panel
  requirement. No performance result or percentage improvement was invented.
- React Doctor `0.9.12` scanned all nine React/Next.js files with a score of 100 and no
  diagnostics. UI and transition reviews found no Phase-A release blocker and installed
  no motion dependency.
- `pnpm check` passed with zero errors and the same three intentionally staged warnings;
  tests remained 2/2 passing and the Next.js production build succeeded.
- `pnpm audit --prod --audit-level high` reported no known vulnerabilities. Secret,
  prohibited legal-state, deprecated WebMCP, deprecated Storefront query, and Shopify
  server-MCP boundary scans were clean.
- Cloudflare account access was verified through a successful account-details API call.
- GitHub and Vercel could not be used for external writes: GitHub identified the expected
  user but exposed no installed repository access and the local CLI token was invalid;
  Vercel's persisted browser/CLI sessions were logged out. No repository URL or
  deployment URL was manufactured.
- Added a current step-by-step Shopify setup guide. The live spike stopped at the eight
  missing environment inputs before making a Shopify request.
