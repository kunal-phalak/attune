# Shopify Integration Boundary

Attune uses two Shopify API paths and one browser-native handoff.

```text
Attune server
  → Shopify Admin GraphQL
  → Shopify Storefront GraphQL product(handle)
    verification only

Browser on the Shopify Liquid product page
  → Shopify-native WebMCP get_product
  → Shopify-native WebMCP update_cart(quantity: 1)
    visible shopper session
```

Attune does not call Shopify's Storefront MCP or UCP MCP endpoints. In particular, the
application must not send requests to either of these server-side agent endpoints:

```text
https://{shop}/api/mcp
https://{shop}/api/ucp/mcp
```

Those products solve a different integration problem and would weaken the cross-origin
browser story demonstrated by Attune.

## Connectivity spike

Run from the repository root after putting real credentials in `.env.local`:

```bash
pnpm shopify:spike
```

The script performs:

1. same-organization client-credentials authentication;
2. synchronous `productSet`;
3. Admin product reread and conformance comparison;
4. `publishablePublish` and `publishedOnPublication` verification;
5. Storefront API `product(handle:)` polling with 1, 2, 4, 8, and 15 second waits;
6. variant, SKU, price, availability, and metafield comparison;
7. creation of a local redacted evidence file.

The script intentionally does not automate the storefront password or browser-native
WebMCP steps. Those must be tested in the judge-equivalent visible browser session.

## Quantity contract

```text
Fabrication specification: 4 panels
Shopify variant: Fabrication lot — 4 panels
Price: ₹2,400 per lot
Cart quantity: 1
Physical panels represented: 4
```

Adding four Shopify units would represent sixteen panels and is a test failure.

## Storefront metafields

The `attune` metafield definitions used by the spike must be readable through Storefront
GraphQL. The Storefront verification must fail rather than silently accept missing
metafields.

## P0 boundary

`get_product` and a visible `update_cart(quantity: 1)` are release requirements.
`proceed_to_checkout`, payment, orders, and fulfillment are outside P0 acceptance.
