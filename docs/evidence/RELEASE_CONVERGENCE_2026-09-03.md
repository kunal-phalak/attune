# Attune release convergence — 2026-09-03

This record covers the local release candidate on top of `cd1bfdb`. It contains no credentials,
access tokens, signed object URLs, customer addresses, or hidden model reasoning.

## Checkpoints

- `ed737f6` — `feat: converge manufacturing workflows and webmcp`
- `2f0996c` — `feat: add Shopify OAuth connections`
- `e0d582a` — `fix: finish judge commerce release UX`

## Automated verification

| Gate | Result |
| --- | --- |
| Focused OAuth, customer, media, manufacturing, version, permission, WebMCP, and eval tests | 68 passed |
| Full repository test suite | 209 passed, 1 live test skipped by its opt-in guard |
| Web TypeScript | Passed |
| Database and domain TypeScript | Passed |
| Scoped lint | No errors; existing complexity/size warnings remain |
| Production build | Passed |
| Live R2 exact-preview round trip | Passed: render, upload, HEAD, signed GET, PNG read |

The structured WebMCP catalog contains 22 unique scenarios: 3 design, 9 manufacturing, 5
authority, 4 customer, and 1 conflict. Its runner records selected tools, arguments, observable
results, final state, timing, and pass/fail without recording chain of thought, secrets, or full
customer addresses. Catalog structure and the observable-trace rubric pass automated tests.

## Browser verification

- Public landing and authentication surfaces passed desktop and mobile inspection.
- A synthetic normal account passed dashboard, workspace, Settings, and maker-marketplace access.
- The normal workspace exposed zero Attune WebMCP tools and no Judge mode frame.
- Real Mapbox GL loaded with tiles and two demo markers. Card selection updated the selected marker
  location, and reduced-motion behavior remains implemented.
- Shopify Settings showed the disconnected multi-store state and strict `.myshopify.com` validation.
- An authenticated OAuth start redirected to `/admin/oauth/authorize` with `client_id`, `scope`,
  `redirect_uri`, and `state`; values were not recorded.
- A forged OAuth callback was rejected as invalid or expired state before token exchange.

## Live service status

- Connected Shopify OAuth installations in the configured database: **0**.
- Store A and Store B installation, identity, locations, granted scopes, customer binding, Draft
  Order reread, and optional product-image verification therefore remain blocked on merchant OAuth.
- Judge native discovery/execution and natural-language browser-agent evaluation remain blocked on
  an authenticated judge session.
- The linked Vercel Production target has Mapbox, R2, Shopify app credentials, database, auth, and
  Liveblocks variable names. Preview currently has only database, auth, Liveblocks, and judge
  variables, so a green Preview deployment requires explicit authorization to copy the release
  integration credentials.
- The stable callback to allow-list in the Shopify Dev Dashboard is
  `https://attune-webmcp.vercel.app/api/shopify/oauth/callback`. The matching Vercel callback/app URL
  variable is not currently present.

## Deployment status

No release Preview or Production deployment was created by this verification run. Deployment is
held until the required Preview integration variables exist and the Shopify callback is allow-listed.
