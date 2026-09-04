# Attune

**Let the design find its maker.**

## What Attune is

Attune is a shared workspace for designing custom physical parts and getting them made. A buyer
can create a constrained 2D design, find a compatible maker, request a quote, and carry the exact
quoted version through approval and Shopify checkout.

The design is the source of truth. Geometry, material, thickness, finish, quantity, price, and
approval stay attached to the same version throughout the job.

## Demo

- App: [attune-webmcp.vercel.app](https://attune-webmcp.vercel.app)
- Judge entry: [attune-webmcp.vercel.app/judge](https://attune-webmcp.vercel.app/judge)
- Source: [github.com/kunal-phalak/attune](https://github.com/kunal-phalak/attune)

The judge entry opens a protected review session with a seeded project. It requires no account
credentials and includes a guided route through design, buyer, maker, order, and Shopify states.

## Why WebMCP

Attune gives an agent typed access to the application state through `document.modelContext`.
Instead of inferring intent from pixels, the agent can inspect the current design, call the same
domain operations as the interface, and return an observable result.

That matters when a design becomes a commercial agreement. A geometry edit can invalidate a
quote. A quote must refer to one immutable version. Sending a request, accepting a quote, and
starting checkout need human confirmation. WebMCP lets Attune expose those boundaries directly to
the agent.

## What people + agents do together

| Stage     | Person                                        | Agent                                                                    |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| Design    | Describes the part and chooses what to change | Creates or edits geometry, adds constraints, and checks the design       |
| Sourcing  | Chooses a maker and confirms submission       | Matches the design to maker capabilities and prepares the request        |
| Agreement | Maker sets price and lead time; buyer accepts | Preserves the submitted version, checks state, and prepares each handoff |
| Checkout  | Buyer approves the Shopify handoff            | Verifies the customer and Draft Order against the accepted quote         |

People retain authority over access, OAuth approval, quote submission, acceptance, and checkout.
The agent handles inspection, preparation, validation, and navigation within that authority.

## WebMCP tool model

Attune exposes a small tool set for the surface the user is viewing:

- Design: `inspect_context`, `forecast_change`, `check_design`, `modify_geometry`,
  `constrain_geometry`
- Workflow: `find_makers`, `navigate_workspace`, `manage_manufacturing_request`
- Commerce: `inspect_commerce_pipeline`, `prepare_customer_checkout`
- Account and review: `manage_account`, `inspect_review_flow`, `reset_judge_workspace`

Tools appear only when the signed-in user has the required role and the current state permits the
operation. Navigation does not grant authority. Mutations include explicit targets and expected
versions, and the server checks authority again before execution. Tools disappear when the user
moves to a surface where they no longer apply.

## Challenge demo prompts

Try these in order from the judge session:

1. "Create a 160 mm mounting plate with a 40 mm bore, four 6 mm holes, and a 120 mm bolt circle."
2. "Check whether this design is ready to manufacture."
3. "Find a maker for the current design in 3 mm aluminium."
4. "Select the live Shopify maker and configure four units."
5. "Submit the saved version for manufacturing."
6. "Switch to the maker view and prepare a quote."
7. "Return to the buyer view and accept the quoted version."
8. "Verify the order and continue to Shopify checkout."

The agent will stop for the person whenever the next action requires confirmation.

## Manufacturing + Shopify flow

1. The buyer saves a design version and chooses material, thickness, finish, and quantity.
2. Attune finds makers whose declared capabilities match the request.
3. The buyer confirms submission of that exact version.
4. The maker enters price and lead time, then confirms the quote.
5. Attune creates a Shopify Draft Order and rereads it to verify identity, currency, money,
   quantity, customer, and Attune version data.
6. The buyer accepts the same quote and continues to Shopify's hosted checkout.

Shopify OAuth supplies the real store identity and active location. Attune keeps manufacturing
capabilities and design history in its own data model. Exact-version previews are stored privately
in Cloudflare R2 and shared with Shopify through short-lived signed URLs. On a Shopify Liquid
storefront, Shopify's own browser WebMCP tools handle storefront actions.

## Architecture

- `apps/web`: Next.js 16 and React 19 application, API routes, workspace UI, and WebMCP tools
- `packages/domain`: design, manufacturing, and versioning rules
- `packages/capabilities` and `packages/command-bus`: authority checks and mutations
- `packages/webmcp`: tool schemas and protocol integration
- `packages/shopify`: OAuth, customer, Draft Order, product, and verification logic
- `packages/database`: Neon Postgres persistence through Drizzle

Liveblocks and Yjs provide collaboration. Cloudflare R2 stores private previews, and Mapbox renders
maker locations.

## Local development

Attune requires Node.js 24.19 or newer within the Node 24 release line and pnpm 11.22.

```bash
pnpm install
cp .env.example .env.local
pnpm run db:migrate
pnpm run dev
```

Open [localhost:3000](http://localhost:3000). The database migration requires `DATABASE_URL`.
Use `pnpm run build` for the Next.js production build.

## Environment variables

Copy `.env.example` to `.env.local`. Do not commit `.env.local`.

| Area                         | Variables                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App                          | `NEXT_PUBLIC_APP_URL`                                                                                                                                             |
| Database and auth            | `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `ATTUNE_SESSION_SECRET`, `ATTUNE_JUDGE_TOKEN_HASH`                                               |
| Collaboration                | `LIVEBLOCKS_SECRET_KEY`                                                                                                                                           |
| Private previews             | `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_REGION`                                                         |
| Maker map                    | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `MAPBOX_ACCESS_TOKEN`                                                                                                          |
| Shopify OAuth                | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ADMIN_API_VERSION`, `SHOPIFY_OAUTH_REDIRECT_URI`, `SHOPIFY_TOKEN_ENCRYPTION_KEY`                           |
| Optional Shopify diagnostics | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_PASSWORD`, `SHOPIFY_ONLINE_STORE_PUBLICATION_ID`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_STOREFRONT_API_VERSION` |

The Shopify app callback must match `SHOPIFY_OAUTH_REDIRECT_URI`. The requested core scopes are
`read_locations`, `write_draft_orders`, `read_customers`, `write_customers`, `read_orders`,
`unauthenticated_read_content`, and `unauthenticated_read_product_listings`. Product
materialization also uses `write_products`, `write_publications`, `read_inventory`, and
`write_files`.

`ATTUNE_SESSION_SECRET` must contain at least 32 characters. In production, use a separate
32-byte encoded `SHOPIFY_TOKEN_ENCRYPTION_KEY`.

## Testing

The current release passes 232 automated tests, with one opt-in live test skipped. Its structured
WebMCP catalog covers 35 evaluation scenarios. TypeScript checks and the Next.js production build
also pass.

```bash
pnpm run check
pnpm run test
pnpm run build
```

## License

Attune is licensed under Apache-2.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for
third-party licenses. Attune was implemented from scratch during the challenge period.
