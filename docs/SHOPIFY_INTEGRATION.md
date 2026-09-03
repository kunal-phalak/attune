# Shopify integration boundary

Attune uses Shopify for real provider identity, locations, and checkout. Shopify does not define
manufacturing capability: process limits, materials, thicknesses, finishes, and tolerances remain
explicit Attune profile facts.

## Operational quote-to-checkout path

```text
Buyer design and manufacturing configuration
  → Shopify Admin shop + location reread
  → exact Attune manufacturing request
  → maker-entered quote and immutable revision
  → Shopify Draft Order with one custom line item
  → Admin Draft Order reread and conformance check
  → buyer accepts that exact revision
  → Shopify-hosted invoice checkout
```

The line item stores the Attune workspace, request, revision, specification hash, provider,
provider-profile version, Shopify location, material, thickness, finish, and requested physical
quantity as custom attributes. The Shopify line-item quantity is one because it represents one
quoted fabrication lot; the number of physical parts is an attribute of that lot.

The Draft Order path requires `write_draft_orders`. Customer attachment is optional and is used
only when a trusted Shopify customer ID is already known. After `draftOrderCreate`, Attune rereads
the Draft Order and fails closed unless identity, money, currency, quantity, and every binding
attribute match.

## Provider identity path

The marketplace queries the connected shop and its active locations at runtime. A provider is
labeled **Live provider** only after that query succeeds. Additional marketplace entries are
explicitly labeled **Demo profile** and never claim live availability, inventory, or pricing.

The identity path requires `read_locations`. A public Mapbox token is optional for the interface;
without it, Attune presents a synchronized location fallback instead of a map.

## Optional product materialization

The Online Store product route is an optional enhancement. It requires product, publication,
location, inventory, and Storefront scopes and performs Admin, publication, and Storefront
rereads. Its title, handle, SKU, price, currency, physical quantity, revision, and hash are derived
from the current accepted quote; no seeded part, revision, quantity, or price is used.

Attune does not call Shopify's server-side Storefront MCP or UCP MCP endpoints. On a visible Liquid
storefront, Shopify-native browser WebMCP is authoritative for storefront interaction.

## Failure boundaries

Identity/location access, Draft Orders, customer lookup, optional product materialization, and
Storefront verification are independently detected capabilities. Missing optional scopes do not
invalidate a working Draft Order checkout path. Missing identity/location or Draft Order access
blocks the corresponding operational step with the Shopify error exposed to the user.
