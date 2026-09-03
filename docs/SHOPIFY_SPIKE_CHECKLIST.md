# Shopify operational checklist

- [x] Development store and Dev Dashboard app belong to the same organization.
- [x] Client-credentials grant succeeds.
- [x] Connected shop identity can be read.
- [x] Active locations can be read and selected without a hard-coded location ID.
- [x] App has `write_draft_orders` for the quote-to-invoice path.
- [x] App capability boundaries are reported independently.
- [ ] Buyer submits a configured request for the exact current specification hash.
- [ ] Maker enters price and lead time and freezes that exact revision.
- [ ] Shopify creates a real Draft Order with one custom fabrication line item.
- [ ] Admin reread proves money, currency, revision, hash, provider, location, and configuration.
- [ ] Buyer accepts the same immutable revision and opens the Shopify invoice checkout.
- [ ] Screenshots record buyer request, maker quote, buyer acceptance, and Shopify invoice.

## Optional Online Store product path

- [x] Liquid storefront is active and password protected.
- [x] Online Store publication ID is confirmed.
- [x] Attune metafield definitions are Storefront-readable.
- [ ] Product, publication, inventory, and Storefront verification all pass for the current quote.
- [ ] Shopify-native browser WebMCP reads the visible product when this optional path is shown.
