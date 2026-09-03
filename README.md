# Attune

**Create what doesn't exist yet.**

Attune is an agent-native specification layer for custom physical work. The challenge
build begins with constrained 2D fabrication because it is the smallest domain where
intent, geometry, manufacturability, commercial agreement, and external execution can be
demonstrated objectively.

## Challenge release

Attune carries one exact design version through a two-sided manufacturing workflow:

- **Buyer Requests** contain quote requests that were sent to makers.
- **Orders** contain accepted quotes and their checkout/production state.
- **Maker Requests** contain incoming work awaiting a maker commitment.
- **Jobs** contain accepted manufacturing work.
- Change requests stay inside the original manufacturing record and preserve the submitted
  version, preview, specification hash, quote, and acceptance chain.

Authenticated workspaces expose contextual browser-native WebMCP tools through
`document.modelContext`. Tools use progressive disclosure rather than a global fixed set: the
dashboard exposes project and notification tools; Design exposes inspection and geometry tools;
Buyer and Maker surfaces expose only operations valid for the current request state; Settings
exposes connected-store and loaded-Draft-Order tools. Tool schemas, navigation destinations, and
server execution all derive from the signed-in user's possessed authority and current capability
blockers. Quote finalization, acceptance, checkout handoff, and judge reset require explicit
confirmation. Agent access is visible, finite, revocable, and revalidated after authority changes.

Shopify OAuth creates a durable store installation, adds Maker authority without removing Buyer
authority, selects a real active location when available, and prepares a marketplace-listed Maker
profile. Listed connected Makers are discoverable across accounts, while connection management,
customer data, and Draft Orders remain owner-scoped. Exact-version previews are stored privately in
Cloudflare R2 and supplied to Shopify only through short-lived signed URLs. OAuth approval remains a
human merchant action.

Production: [attune-webmcp.vercel.app](https://attune-webmcp.vercel.app)

Challenge reviewers begin at
[attune-webmcp.vercel.app/judge](https://attune-webmcp.vercel.app/judge). The protected review
session opens on the dashboard with the seeded project and a state-aware route through the design,
Buyer Requests, Maker Requests, orders, Shopify handoff, and the scoped reset. It
contains no credentials.

Public repository: [github.com/kunal-phalak/attune](https://github.com/kunal-phalak/attune)

## Local development

```bash
pnpm install
pnpm run check
pnpm run test
pnpm run dev
```

Use `pnpm run build` for the Next.js production build. Do not use Vite+'s built-in
`vp build`, which targets Vite applications rather than the Next.js package script.

Copy `.env.example` to `.env.local` only when connecting Shopify. Never commit secrets.
If `SHOPIFY_STOREFRONT_ACCESS_TOKEN` is blank, the connectivity spike creates one through
Admin GraphQL, stores it only in the ignored local environment file, and records no token
value in its evidence.

## Shopify setup

See [Shopify integration](docs/SHOPIFY_INTEGRATION.md) and the
[connectivity checklist](docs/SHOPIFY_SPIKE_CHECKLIST.md). Start with the
[step-by-step Shopify setup guide](docs/SHOPIFY_SETUP_GUIDE.md) when creating the final
development store and app.

## Licensing and challenge provenance

- Attune: Apache-2.0
- [Prior work disclosure](docs/PRIOR_WORK.md)
- [Build ledger](docs/BUILD_LEDGER.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
