# Attune Build Ledger

This ledger distinguishes implementation work from the pre-implementation specification.

## 2026-08-29 — External-risk-first foundation

- Confirmed that the repository contained no implementation code at the challenge-period start.
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
- GitHub identified the expected user but exposed no installed repository or repository
  creation action during that run. No connected Vercel deployment action was callable.
  CLI state was not treated as evidence about connected-plugin availability.
- Added a current step-by-step Shopify setup guide. The live spike stopped at the eight
  missing environment inputs before making a Shopify request.

## 2026-08-29 — Production deployment and first Shopify run

- Created and linked the authenticated Vercel project `attune`, preserving the monorepo
  by configuring `apps/web` as the project root.
- The first deployment exposed a real packaging failure because a subdirectory-only
  upload omitted the root TypeScript configuration. The corrected monorepo deployment
  completed successfully and was promoted to `https://attune-beta-five.vercel.app`.
- Verified public HTTPS and `/api/build-status` with HTTP 200 responses. The deployed
  browser origin discovered and executed `inspect_attune_build` through native
  `document.modelContext`; its result identified production commit `09e9f38adf74` and
  retained the `phase-a-only` boundary.
- Captured the production page and a redacted machine-readable verification record under
  `docs/evidence/phase-a/`.
- Generated the missing Shopify Storefront access token through Admin GraphQL and stored
  it only in the ignored local environment file. Evidence records its ID and read scope,
  never its token value.
- Shopify Admin authentication, `productSet`, Admin reread, `publishablePublish`, and the
  configured Online Store publication check passed for the disposable one-lot product.
- Storefront conformance correctly failed: the shop currency is USD rather than INR, the
  Storefront product returned no Online Store URL, and the four `attune` metafields were
  unreadable because their definitions do not yet exist. Browser-native cart work was not
  attempted after this failure.
- Updated the next spike run to create and verify the four required `PUBLIC_READ`
  metafield definitions before product materialization. No Neon or editor work began.

## 2026-08-29 — Public repository and Shopify browser gate

- Published the challenge-period history to the public repository at
  `https://github.com/kunal-phalak/attune` with `main` tracking the local challenge branch.
- Verified through GitHub's public repository metadata that the repository is public and
  its license is detected as `Apache-2.0` (`apache-2.0`).
- Re-ran the Shopify API spike after changing the shop currency to INR and publishing
  the Liquid storefront. Admin authentication, synchronous `productSet`, Admin reread,
  Online Store publication, Storefront `product(handle:)`, all four `attune` metafields,
  the ₹2,400 INR lot price, SKU, and panel count passed.
- Verified the password-protected direct Liquid product URL in the in-app browser. The
  authenticated page exposed Shopify-native `get_product` and `update_cart`; no
  Storefront MCP or UCP MCP endpoint was called.
- The first native cart attempt exposed `inventoryPolicy: DENY` with zero inventory. The
  spike was corrected to materialize subsequent disposable variants with
  `inventoryPolicy: CONTINUE` and to verify that policy on the Admin reread.
- A fresh product then passed the full API path and Shopify-native `get_product`, but
  Shopify-native `update_cart(quantity: 1)` still returned the item as sold out. The
  visible Liquid page disabled quantity entry and displayed `Unavailable`; cart quantity
  remained zero. Admin reported `CONTINUE`, quantity zero, and inventory tracking off,
  while Storefront GraphQL and native `get_product` both reported the variant available.
- Captured the redacted contradiction and visible failure under `docs/evidence/shopify/`.
  The complete Shopify gate remains blocked; Neon, Kumo, CanvasKit, PlaneGCS, auth, and
  editor work did not begin.
- Re-ran formatting, lint, type checks, unit tests, the Next.js production build,
  dependency audit, secret scan, legal-state scan, deprecated WebMCP/query scan, and
  Storefront MCP/UCP boundary scan. All passed with four intentionally non-blocking
  pre-freeze complexity/function-size warnings.

## 2026-08-29 — Inventory-aware Shopify contract

- Replaced the implicit zero-inventory variant model with an explicit fabrication-lot
  inventory contract. `panel_count = 4` remains the physical contents of one lot;
  Shopify inventory is separately modeled as ten orderable `FABRICATION_LOT` units.
- Updated synchronous `productSet` to write `inventoryQuantities` at a discovered active
  location that fulfills online orders. Admin conformance now verifies tracking,
  location, available quantity, aggregate quantity, and `DENY` oversell policy before
  publication or Storefront verification.
- Added a redacted inventory-level diagnostic and exposed the eventual Commerce-panel
  inventory shape without starting database or product implementation.
- The first inventory-aware preflight stopped before product creation because the
  installed app cannot query `locations`. The granted scope set contains product and
  publication access but lacks `read_locations`.
- Added an explicit Admin-scope preflight and updated the setup guide. The single next
  external gate is releasing and approving an app version that adds `read_locations`.
  No Neon, auth, Kumo, CanvasKit, PlaneGCS, or editor work began.
- Formatting, lint, type checks, 2/2 unit tests, and the Next.js production build passed.
  Five complexity/function-size findings remain warnings under the approved pre-freeze
  policy.

## 2026-08-29 — Inventory readback scope and fixture cleanup

- Confirmed that the released app now grants `read_locations`. The first bounded
  inventory-aware retry reached `productSet`, then Shopify denied the nested
  `inventoryLevels` readback because `read_inventory` is not yet granted.
- Added `read_inventory` to the preflight and setup guide. `write_inventory` remains
  intentionally absent because Attune writes the initial quantity through `productSet`,
  whose required mutation scope is `write_products`.
- Added an exact-match cleanup command constrained by both the
  `attune-connectivity-spike-` handle prefix and the exact spike title.
- A dry run identified five disposable fixtures. All five were permanently deleted, and
  a post-cleanup dry run verified zero matches. No non-spike product was targeted.

## 2026-08-30 — AT-1042 authoritative vertical slice

- Ran the single bounded Shopify retry. The scope preflight stopped before mutation because
  `read_inventory` is still absent; no disposable product was created and cleanup was therefore
  unnecessary. `write_inventory` remains deliberately absent.
- Started product work under the revised policy without weakening or redesigning the Shopify
  spike. Added a deterministic AT-1042 domain model with a 218 × 120 × 3 mm acrylic panel, four
  locked mounts, two equal/symmetric auxiliary holes, one slot, fabrication quantity four, and
  analytic `8.1 mm < 12 mm` clearance evidence.
- Added two exact valid repairs with predicted specification hashes and lock-preservation evidence.
- Added one semantic command bus for human and WebMCP operations. Server execution paths assign
  `human_ui`, `webmcp`, `provider`, and `shopify_verification` provenance; commands cannot submit
  their own authoritative origin.
- Every transition now produces a deeply immutable receipt with before/after hashes, affected
  entities, preserved locks, validation evidence, workspace sequence, draft version, capability
  epoch, principal, role, and origin.
- Added a pure capability compiler and execution-time revalidation. Tests prove optimistic
  concurrency, idempotency, role/path enforcement, stale-epoch rejection, and rejection after a
  once-valid capability disappears.
- Implemented and tested the complete in-process golden authority path: deterministic repair to
  valid r7, quote request, provider freeze/₹2,400 one-lot quote, exact-r7 acceptance, verified
  commerce linkage, human edit to r8, immutable/materialized r7 preservation, and removal of r8
  commerce authority.
- Replaced the Phase-A page tool with contextual native `document.modelContext` tools:
  `inspect_attune_workspace`, `compare_valid_changes`, and conditionally
  `apply_attune_repair`. The UI repair control and WebMCP endpoint call the same command bus through
  separate server-assigned provenance routes.
- Browser verification discovered all three native tools, applied the move-slot repair through
  WebMCP, observed clearance move from 8.1 to 12 mm, preserved 4/4 locks, emitted an origin=`webmcp`
  receipt, and observed the consequential tools disappear. A fresh run applied the same repair
  through the human UI; the next agent inspection automatically returned the unseen
  origin=`human_ui` receipt without user explanation.
- The current process-local runtime is a vertical-slice adapter, not durable production storage.
  Durable persistence and the remaining quote/acceptance UI/WebMCP bindings are the next product
  milestone before the reduced CanvasKit/PlaneGCS editor.
- Vite+ check passes with zero errors and only the four existing Shopify spike warnings. Nine of
  nine unit tests and the Next.js production build pass.
