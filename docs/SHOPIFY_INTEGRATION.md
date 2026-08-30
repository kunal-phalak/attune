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

`SHOPIFY_STOREFRONT_ACCESS_TOKEN` may initially be blank. After Admin authentication, the
spike creates a scoped Storefront access token, saves it only to the ignored local
environment file, and records its non-secret ID and scope metadata. It never writes the
token value into logs or evidence.

The script performs:

1. same-organization client-credentials authentication;
2. resolution of an active Shopify location that fulfills online orders;
3. synchronous `productSet`, including an explicit positive inventory quantity at that
   location;
4. Admin product and inventory reread with conformance comparison;
5. `publishablePublish` and `publishedOnPublication` verification;
6. Storefront API `product(handle:)` polling with 1, 2, 4, 8, and 15 second waits;
7. variant, SKU, price, availability, and metafield comparison;
8. creation of a local redacted evidence file.

The script intentionally does not automate the storefront password or browser-native
WebMCP steps. Those must be tested in the judge-equivalent visible browser session.

The product materialization endpoint uses the same contract with a stable
`productSet(identifier: { handle })` upsert for exact r7. It preflights authority before
the external write and revalidates the command bus again before recording the immutable
`shopify_verification` receipt. Shopify credentials remain server-only.

## Quantity contract

```text
Fabrication specification: 4 panels
Shopify variant: Fabrication lot — 4 panels
Price: ₹2,400 per lot
Cart quantity: 1
Physical panels represented: 4
```

Adding four Shopify units would represent sixteen panels and is a test failure.

## Inventory contract

Shopify inventory and fabrication quantity are different facts:

```text
panel_count:              4 panels inside one fabrication lot
cart quantity:            1 fabrication lot
inventory stock unit:     FABRICATION_LOT
spike available quantity: 10 orderable fabrication lots
inventory policy:         DENY after those ten lots are exhausted
```

The spike discovers an active location with `fulfillsOnlineOrders = true`; no location ID
is copied into source or required as a secret. `productSet` writes the variant's
`inventoryQuantities` for that location and the Admin reread must prove all of:

- inventory tracking is enabled;
- the selected location is active and fulfills online orders;
- the available quantity is ten fabrication lots;
- the aggregate variant inventory quantity is ten;
- inventory policy is `DENY`.

If any inventory fact is absent or inconsistent, the product is not eligible for browser
WebMCP verification.

The app therefore needs `read_locations` to resolve the location and `read_inventory` to
verify `InventoryLevel` state. Inventory mutation remains part of `productSet` under the
existing `write_products` scope; Attune does not require a separate inventory mutation.

As of August 30, 2026, the installed app still lacks `read_inventory`. Both the bounded
spike and the product materialization service stop at scope preflight before creating or
updating a product.

## Storefront metafields

The `attune` metafield definitions used by the spike must be readable through Storefront
GraphQL. The Storefront verification must fail rather than silently accept missing
metafields.

## P0 boundary

`get_product` and a visible `update_cart(quantity: 1)` are release requirements.
`proceed_to_checkout`, payment, orders, and fulfillment are outside P0 acceptance.
