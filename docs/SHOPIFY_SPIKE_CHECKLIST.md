# Shopify Connectivity Spike Checklist

Do not begin Neon, Kumo, judge-session, or editor work until every item is verified on
the final development store.

- [ ] Development store and Dev Dashboard app belong to the same organization.
- [ ] Liquid/Dawn storefront is active and password protected.
- [ ] Client-credentials grant succeeds.
- [ ] App has the required product and publication scopes.
- [ ] Online Store publication ID is confirmed.
- [ ] Attune metafield definitions are Storefront-readable.
- [ ] `pnpm shopify:spike` completes and writes redacted evidence.
- [ ] Storefront password works in a WebMCP-enabled browser.
- [ ] The generated product is visible after password entry.
- [ ] Shopify-native `get_product` returns the visible product.
- [ ] Shopify-native `update_cart` adds quantity one.
- [ ] Visible cart shows one ₹2,400 lot representing four panels.
- [ ] Product-page screenshot is captured.
- [ ] Cart screenshot is captured.
- [ ] Browser, timestamp, theme, and API versions are recorded.
