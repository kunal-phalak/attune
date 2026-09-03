# Attune release convergence — 2026-09-03

This record covers the final release candidate on top of `995507d`. It contains no credentials,
access tokens, signed object URLs, customer addresses, or hidden model reasoning.

## Checkpoints

- `ed737f6` — `feat: converge manufacturing workflows and webmcp`
- `2f0996c` — `feat: add Shopify OAuth connections`
- `e0d582a` — `fix: finish judge commerce release UX`

## Automated verification

| Gate                                                                          | Result                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Focused WebMCP, Shopify Draft Order, OAuth, R2 preview, and marketplace tests | 24 passed                                           |
| Full repository test suite                                                    | 219 passed, 1 live test skipped by its opt-in guard |
| Web TypeScript                                                                | Passed                                              |
| Database and domain TypeScript                                                | Passed                                              |
| Scoped lint                                                                   | No errors; existing complexity/size warnings remain |
| Production build                                                              | Passed                                              |
| Shopify Admin GraphQL schema validation                                       | Passed                                              |
| Live R2 exact-preview round trip                                              | Passed: render, upload, HEAD, signed GET, PNG read  |

The structured WebMCP catalog contains 22 unique scenarios: 3 design, 9 manufacturing, 5
authority, 4 customer, and 1 conflict. Its runner records selected tools, arguments, observable
results, final state, timing, and pass/fail without recording chain of thought, secrets, or full
customer addresses. Catalog structure and the observable-trace rubric pass automated tests.

## Browser verification

- Public landing and authentication surfaces passed desktop and mobile inspection.
- A synthetic normal account passed dashboard, workspace, Settings, and maker-marketplace access.
- Unauthenticated review pages expose zero privileged WebMCP tools.
- Mapbox GL is bundled from the pinned npm package; runtime CDN script injection was removed.
- Stored exact-version images use short-lived Cloudflare R2 URLs; pending judge versions are
  backfilled before the human workspace view is compiled.
- Shopify Settings showed the disconnected multi-store state and strict `.myshopify.com` validation.
- An authenticated OAuth start redirected to `/admin/oauth/authorize` with `client_id`, `scope`,
  `redirect_uri`, and `state`; values were not recorded.
- A forged OAuth callback was rejected as invalid or expired state before token exchange.

## Live service status

- Connected, marketplace-listed Shopify Makers are discovered across accounts. Installation
  management, Draft Orders, and checkout handoff remain restricted to the installation owner.
- Authenticated judge execution still requires the submission access code and was not automated in
  this evidence run.
- The linked Vercel Production target has Mapbox, R2, Shopify app credentials, database, auth, and
  Liveblocks variable names. Preview currently has only database, auth, Liveblocks, and judge
  variables, so a green Preview deployment requires explicit authorization to copy the release
  integration credentials.
- The stable callback to allow-list in the Shopify Dev Dashboard is
  `https://attune-webmcp.vercel.app/api/shopify/oauth/callback`. `NEXT_PUBLIC_APP_URL` is configured
  for the Production target.

## Deployment status

Production deployment `dpl_63sVss19SHEQfe7n7X4FyPijYR7Y` reached `READY` and was aliased to
`https://attune-webmcp.vercel.app`. The public landing page and judge entry rendered without browser
console errors, and `/api/build-status` returned HTTP 200 with all Shopify server inputs present.
