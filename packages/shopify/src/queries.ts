export const VERIFY_SCOPES = `#graphql
  query VerifyAttuneScopes {
    currentAppInstallation { accessScopes { handle } }
  }
`;

export const INSPECT_PROVIDER = `#graphql
  query InspectAttuneProvider {
    currentAppInstallation { accessScopes { handle } }
    shop {
      id name myshopifyDomain currencyCode
      primaryDomain { host url }
    }
    locations(first: 50) {
      nodes {
        id name isActive fulfillsOnlineOrders
        address {
          formatted address1 address2 city province provinceCode
          country countryCode zip latitude longitude
        }
      }
    }
  }
`;

export const RESOLVE_LOCATION = `#graphql
  query ResolveAttuneLocation {
    locations(first: 20) {
      nodes { id name isActive fulfillsOnlineOrders }
    }
  }
`;

export const PRODUCT_SET = `#graphql
  mutation MaterializeAttuneProduct(
    $identifier: ProductSetIdentifiers!
    $input: ProductSetInput!
  ) {
    productSet(identifier: $identifier, synchronous: true, input: $input) {
      product {
        id handle status title
        metafields(first: 10) { nodes { namespace key value } }
        variants(first: 1) {
          nodes {
            id title price sku inventoryPolicy inventoryQuantity
            inventoryItem {
              tracked
              inventoryLevels(first: 5) {
                nodes {
                  location { id isActive fulfillsOnlineOrders }
                  quantities(names: ["available"]) { name quantity }
                }
              }
            }
          }
        }
      }
      userErrors { code field message }
    }
  }
`;

export const ADMIN_REREAD = `#graphql
  query RereadAttuneProduct($id: ID!, $publicationId: ID!) {
    product(id: $id) {
      id handle status title
      publishedOnPublication(publicationId: $publicationId)
      metafields(first: 10) { nodes { namespace key value } }
      variants(first: 1) {
        nodes {
          id title price sku inventoryPolicy inventoryQuantity
          inventoryItem {
            tracked
            inventoryLevels(first: 5) {
              nodes {
                location { id isActive fulfillsOnlineOrders }
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
        }
      }
    }
  }
`;

export const PUBLISH_PRODUCT = `#graphql
  mutation PublishAttuneProduct($id: ID!, $publicationId: ID!) {
    publishablePublish(id: $id, input: { publicationId: $publicationId }) {
      publishable { publishedOnPublication(publicationId: $publicationId) }
      userErrors { field message }
    }
  }
`;

export const FILE_CREATE = `#graphql
  mutation CreateAttuneVersionPreview($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id fileStatus alt
        ... on MediaImage { image { url } }
      }
      userErrors { code field message }
    }
  }
`;

export const FILE_REREAD = `#graphql
  query RereadAttuneVersionPreview($id: ID!) {
    node(id: $id) {
      ... on MediaImage { id fileStatus alt image { url } }
    }
  }
`;

export const PRODUCT_ADD_MEDIA = `#graphql
  mutation AttachAttuneVersionPreview(
    $product: ProductUpdateInput!
    $media: [CreateMediaInput!]
  ) {
    productUpdate(product: $product, media: $media) {
      product {
        id
        media(first: 25) {
          nodes { id alt mediaContentType status }
        }
      }
      userErrors { field message }
    }
  }
`;

export const PRODUCT_MEDIA_REREAD = `#graphql
  query RereadAttuneProductMedia($id: ID!) {
    product(id: $id) {
      id
      media(first: 25) {
        nodes { id alt mediaContentType status }
      }
    }
  }
`;

export const STOREFRONT_REREAD = `#graphql
  query VerifyAttuneProduct($handle: String!) {
    product(handle: $handle) {
      id handle title onlineStoreUrl
      metafields(identifiers: [
        { namespace: "attune", key: "commitment_id" }
        { namespace: "attune", key: "revision_id" }
        { namespace: "attune", key: "spec_hash" }
        { namespace: "attune", key: "panel_count" }
      ]) { namespace key value }
      variants(first: 1) {
        nodes {
          id title sku availableForSale
          price { amount currencyCode }
        }
      }
    }
  }
`;
