# Shopify Setup Guide

Use the separate Shopify demo/developer email account if you control it. The Shopify
account email does not need to match the Devpost login for this technical integration.
Keep the account owned by the Attune team, retain recovery access through judging, and
do not share the Shopify admin login with judges. Judges receive only the storefront
password in the submission testing instructions.

Do not invite Codex as a Shopify staff user and do not paste the client secret or access
tokens into chat. Store secrets in `.env.local` and later in Vercel's encrypted project
environment.

## 1. Create the Shopify organization

1. Sign in to the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard) using the
   controlled demo/developer account.
2. Create or select a Partner organization dedicated to Attune.
3. Confirm that the account can manage both **Apps** and **Dev stores**.

The app and dev store must appear under the same organization. Client-credentials
authentication fails with `shop_not_permitted` when they do not. See Shopify's
[client credentials requirements](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant).

## 2. Create the final dev store

1. In the Dev Dashboard, open **Stores**.
2. Select **Create store**.
3. Choose **Dev** as the store type.
4. Name it `Attune WebMCP Challenge` or another stable submission name.
5. Choose **Basic** unless a challenge requirement needs another plan.
6. Do not enable a feature preview.
7. Create the store and open its Shopify admin.

Create the store from the Dev Dashboard—not from a normal Shopify trial. Shopify states
that client credentials work only when the app and store are in the same organization.
See [Dev stores](https://shopify.dev/docs/apps/build/stores/development-stores).

Record the permanent `*.myshopify.com` domain. Do not use a custom domain for the API
configuration.

## 3. Keep the Liquid storefront

1. In the store admin, open **Online Store → Themes**.
2. Keep Shopify's current Dawn theme published.
3. Do not create Hydrogen or a separate headless storefront.
4. Confirm that opening the storefront shows the dev-store password page.

Shopify automatically provides browser-native WebMCP on Liquid storefronts; no Shopify
WebMCP app or theme code is required. See [Shopify WebMCP tools](https://shopify.dev/docs/api/web-mcp).

## 4. Set the storefront password

1. In Shopify admin, open **Online Store → Preferences**.
2. Under **Store access → Password protection**, set a challenge-only password.
3. Do not reuse the Shopify admin password.
4. Save and verify the password in a private/incognito browser window.

Dev stores remain password-protected. See Shopify's
[development-store password instructions](https://help.shopify.com/partners/building-stores-for-merchants/create-a-development-store#the-development-store-password-page).

## 5. Create the Attune Admin API app

1. Return to the same organization's Dev Dashboard.
2. Open **Apps → Create app → Start from Dev Dashboard**.
3. Name the app `Attune Commerce Bridge`.
4. Open **Versions** and create a version.
5. Use the deployed Attune HTTPS URL as the app URL when available. Until then, Shopify
   permits `https://shopify.dev/apps/default-app-home` for a non-embedded API-only app.
6. Select these required scopes:
   - `write_products`
   - `write_publications`
   - `read_locations`
   - `unauthenticated_read_product_listings`
7. Release the version.
8. From the app's **Home** page, select **Install app** and install it on the final Attune
   dev store.

`write_products` covers `productSet`, including variant `inventoryQuantities`;
`write_publications` covers `publishablePublish`; and `read_locations` lets the spike
discover an active location that fulfills online orders. The unauthenticated
product-listing scope allows a Storefront API token to query the product. Shopify
documents the required behavior on
[`productSet`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet),
[`publishablePublish`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish),
[`locations`](https://shopify.dev/docs/api/admin-graphql/latest/queries/locations),
and the [Storefront Product object](https://shopify.dev/docs/api/storefront/latest/objects/Product).

When adding a scope to an already installed app:

1. Open **Dev Dashboard → Apps → Attune Commerce Bridge → Versions**.
2. Create a version from the current released version.
3. Add `read_locations` without removing the existing scopes.
4. Release the new version.
5. Open the app's **Home** page and approve the permission update for the Attune
   development store. If Shopify shows **Install app** instead, install the released
   version on that same store.

No location ID needs to be found or copied manually.

## 6. Obtain the non-secret identifiers

From the app's **Settings** page, record the Client ID. From the store, record the
`*.myshopify.com` domain.

Use these API versions for the spike:

```text
SHOPIFY_ADMIN_API_VERSION=2026-07
SHOPIFY_STOREFRONT_API_VERSION=2026-07
```

The Online Store publication ID is discovered through the Admin GraphQL API after
authentication. Do not guess it or copy a channel ID from a URL.

## 7. Configure secrets locally

Copy `.env.example` to `.env.local` and fill only the values already available:

```text
SHOPIFY_STORE_DOMAIN=<store>.myshopify.com
SHOPIFY_STOREFRONT_PASSWORD=<challenge-only storefront password>
SHOPIFY_CLIENT_ID=<Dev Dashboard client ID>
SHOPIFY_CLIENT_SECRET=<Dev Dashboard client secret>
SHOPIFY_ADMIN_API_VERSION=2026-07
SHOPIFY_STOREFRONT_API_VERSION=2026-07
```

Do not commit `.env.local`.

At this point, tell Codex that the six values above are configured. The remaining setup
is performed and verified programmatically:

1. exchange client credentials for a short-lived Admin token;
2. discover and set `SHOPIFY_ONLINE_STORE_PUBLICATION_ID`;
3. create a public Storefront access token and set
   `SHOPIFY_STOREFRONT_ACCESS_TOKEN`;
4. create or verify the `attune` product metafield definitions with
   `access.storefront: PUBLIC_READ`;
5. run the disposable product connectivity spike.

Shopify documents public token creation through
[`storefrontAccessTokenCreate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/storefrontAccessTokenCreate)
and Storefront-readable metafields through
[metafield definition access](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/products-collections/metafields).

## 8. Judge-equivalent browser proof

After the server-side spike succeeds:

1. Open the generated Liquid product URL in a Chromium browser with WebMCP support.
2. Enter the storefront password.
3. Confirm the product page is visibly loaded.
4. Fetch the page's native Shopify tools.
5. Call Shopify-native `get_product` for the visible product.
6. Call Shopify-native `update_cart` with quantity `1`.
7. Open the visible cart and confirm one ₹2,400 fabrication lot representing four
   panels.

Do not call Shopify's server-side `/api/mcp` or `/api/ucp/mcp` endpoints, do not add
quantity four, and do not make checkout a release requirement.
