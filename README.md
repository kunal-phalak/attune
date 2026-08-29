# Attune

**Create what doesn't exist yet.**

Attune is an agent-native specification layer for custom physical work. The challenge
build begins with constrained 2D fabrication because it is the smallest domain where
intent, geometry, manufacturability, commercial agreement, and external execution can be
demonstrated objectively.

## Current phase

AT-1042 authoritative vertical slice:

- deterministic 218 × 120 × 3 mm acrylic-panel model and exact `8.1 mm < 12 mm`
  manufacturability conflict;
- one semantic command bus for human UI and native WebMCP;
- immutable receipts, server-assigned provenance, state hashes, workspace sequence, draft
  version, and capability epoch;
- compiled and revocable quote, acceptance, revision, and commerce authority;
- contextual `inspect_attune_workspace`, `compare_valid_changes`, and
  `apply_attune_repair` tools registered through `document.modelContext`;
- Shopify spike isolated on the pending `read_inventory` app scope rather than blocking
  product-domain work.

Phase-A deployment: [attune-beta-five.vercel.app](https://attune-beta-five.vercel.app)

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
