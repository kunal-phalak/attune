# Shopify Connectivity Spike Checklist

Do not begin Neon, Kumo, judge-session, or editor work until every item is verified on
the final development store.

- [x] Development store and Dev Dashboard app belong to the same organization.
- [x] Liquid storefront is active and password protected.
- [x] Client-credentials grant succeeds.
- [x] App has the required product and publication scopes.
- [x] App has `read_locations` for deterministic inventory-location discovery.
- [ ] App has `read_inventory` for location-level inventory verification.
- [x] Online Store publication ID is confirmed.
- [x] Attune metafield definitions are Storefront-readable.
- [ ] Current inventory-aware `pnpm shopify:spike` completes and writes redacted evidence.
- [x] Storefront password works in a WebMCP-enabled browser.
- [x] The generated product is visible after password entry.
- [x] Shopify-native `get_product` returns the visible product.
- [ ] Shopify-native `update_cart` adds quantity one.
- [ ] Visible cart shows one ₹2,400 lot representing four panels.
- [x] Product-page screenshot is captured.
- [ ] Cart screenshot is captured.
- [ ] Browser, timestamp, theme, and API versions are recorded.
