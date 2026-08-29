# Attune

**Create what doesn't exist yet.**

Attune is an agent-native specification layer for custom physical work. The challenge
build begins with constrained 2D fabrication because it is the smallest domain where
intent, geometry, manufacturability, commercial agreement, and external execution can be
demonstrated objectively.

## Current phase

External-risk-first foundation:

- minimal Next.js application;
- one imperative, read-only `inspect_attune_build` WebMCP tool;
- Shopify Admin and Storefront connectivity-spike harness;
- no Neon, Kumo, judge access, or editor implementation before Shopify passes.

Phase-A deployment: [attune-beta-five.vercel.app](https://attune-beta-five.vercel.app)

Public repository: [github.com/kunal-phalak/attune](https://github.com/kunal-phalak/attune)

## Local development

```bash
pnpm install
pnpm check
pnpm test
vp run dev
```

Use `vp run build` for the Next.js production build. Do not use Vite+'s built-in
`vp build`, which targets Vite applications rather than Next.js package scripts.

Copy `.env.example` to `.env.local` only when connecting Shopify. Never commit secrets.
If `SHOPIFY_STOREFRONT_ACCESS_TOKEN` is blank, the connectivity spike creates one through
Admin GraphQL, stores it only in the ignored local environment file, and records no token
value in its evidence.

## Shopify gate

See [Shopify integration](docs/SHOPIFY_INTEGRATION.md) and the
[connectivity checklist](docs/SHOPIFY_SPIKE_CHECKLIST.md). Start with the
[step-by-step Shopify setup guide](docs/SHOPIFY_SETUP_GUIDE.md) when creating the final
development store and app.

## Licensing and challenge provenance

- Attune: Apache-2.0
- [Prior work disclosure](docs/PRIOR_WORK.md)
- [Build ledger](docs/BUILD_LEDGER.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
