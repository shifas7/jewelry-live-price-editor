import fetch from "node-fetch";

/**
 * Shopify API Helper
 */
export class ShopifyAPI {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.apiVersion = "2024-10";
  }

  /**
   * Make GraphQL request to Shopify Admin API
   */
  async graphql(query, variables = {}) {
    const response = await fetch(
      `https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      }
    );

    const result = await response.json();

    if (result.errors) {
      throw new Error(JSON.stringify(result.errors));
    }

    return result.data;
  }

  /**
   * Create or update metaobject for metal prices
   */
  async updateMetalPrices(prices) {
    // First, try to get existing metaobject
    const query = `
      query GetMetalPrices {
        metaobjects(type: "metal_prices", first: 1) {
          nodes {
            id
          }
        }
      }
    `;

    const existingResult = await this.graphql(query);
    const existingId = existingResult.metaobjects?.nodes?.[0]?.id;

    const fields = [
      { key: "gold_24kt", value: prices.gold24kt.toString() },
      { key: "gold_22kt", value: prices.gold22kt.toString() },
      { key: "gold_18kt", value: prices.gold18kt.toString() },
      { key: "gold_14kt", value: prices.gold14kt.toString() },
      { key: "platinum", value: prices.platinum.toString() },
      { key: "silver", value: prices.silver.toString() },
      { key: "last_updated", value: new Date().toISOString() },
    ];

    if (existingId) {
      // Update existing
      const mutation = `
        mutation UpdateMetaobject($id: ID!, $fields: [MetaobjectFieldInput!]!) {
          metaobjectUpdate(id: $id, metaobject: {fields: $fields}) {
            metaobject {
              id
              fields {
                key
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const result = await this.graphql(mutation, {
        id: existingId,
        fields,
      });

      return result.metaobjectUpdate;
    } else {
      // Create new
      const mutation = `
        mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject {
              id
              fields {
                key
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const result = await this.graphql(mutation, {
        metaobject: {
          type: "metal_prices",
          fields,
        },
      });

      return result.metaobjectCreate;
    }
  }

  /**
   * Get current metal prices
   */
  async getMetalPrices() {
    const query = `
      query GetMetalPrices {
        metaobjects(type: "metal_prices", first: 1) {
          nodes {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }
    `;

    const result = await this.graphql(query);

    if (
      !result.metaobjects ||
      !result.metaobjects.nodes ||
      result.metaobjects.nodes.length === 0
    ) {
      return null;
    }

    const prices = {};
    result.metaobjects.nodes[0].fields.forEach((field) => {
      if (field.key !== "last_updated") {
        prices[field.key.replace(/_/g, "")] = parseFloat(field.value);
      }
    });

    return prices;
  }

  /**
   * Create or update stone pricing metaobject
   */
  async createStonePricing(stoneData) {
    const mutation = `
      mutation CreateStonePricing($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const fields = [
      { key: "stone_id", value: stoneData.stoneId },
      { key: "stone_type", value: stoneData.stoneType },
      { key: "title", value: stoneData.title || "" },
      { key: "clarity", value: stoneData.clarity || "" },
      { key: "color", value: stoneData.color || "" },
      { key: "shape", value: stoneData.shape || "" },
      { key: "slabs", value: JSON.stringify(stoneData.slabs) },
    ];

    return await this.graphql(mutation, {
      metaobject: {
        type: "stone_pricing",
        fields,
      },
    });
  }

  /**
   * Update existing stone pricing metaobject
   */
  async updateStonePricing(stoneId, stoneData) {
    const mutation = `
      mutation UpdateStonePricing($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const fields = [
      { key: "stone_id", value: stoneData.stoneId },
      { key: "stone_type", value: stoneData.stoneType },
      { key: "title", value: stoneData.title || "" },
      { key: "clarity", value: stoneData.clarity || "" },
      { key: "color", value: stoneData.color || "" },
      { key: "shape", value: stoneData.shape || "" },
      { key: "slabs", value: JSON.stringify(stoneData.slabs) },
    ];

    return await this.graphql(mutation, {
      id: stoneId,
      metaobject: {
        fields,
      },
    });
  }

  /**
   * Get all stone pricing
   */
  async getAllStonePricing() {
    const query = `
      query GetAllStonePricing {
        metaobjects(type: "stone_pricing", first: 50) {
          nodes {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }
    `;

    const result = await this.graphql(query);

    return result.metaobjects.nodes.map((node) => {
      const stone = {};
      node.fields.forEach((field) => {
        if (field.key === "slabs") {
          stone[field.key] = JSON.parse(field.value);
        } else {
          stone[field.key] = field.value;
        }
      });
      stone.id = node.id;
      stone.handle = node.handle;
      return stone;
    });
  }

  /**
   * Update product with price configuration metafields
   */
  async updateProductConfiguration(productId, config) {
    const mutation = `
      mutation UpdateProductMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const metafields = [
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "metal_weight",
        value: (config.metalWeight || "0").toString(),
        type: "number_decimal",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "metal_type",
        value: config.metalType || "gold22kt",
        type: "single_line_text_field",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "making_charge_percent",
        value: (config.makingChargePercent || "0").toString(),
        type: "number_decimal",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "labour_type",
        value: config.labourType || "percentage",
        type: "single_line_text_field",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "labour_value",
        value: (config.labourValue || "0").toString(),
        type: "number_decimal",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "wastage_type",
        value: config.wastageType || "percentage",
        type: "single_line_text_field",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "wastage_value",
        value: (config.wastageValue || "0").toString(),
        type: "number_decimal",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "stone_type",
        value: config.stoneType || "",
        type: "single_line_text_field",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "stone_weight",
        value: (config.stoneWeight || "0").toString(),
        type: "number_decimal",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "stone_cost",
        value: (config.stoneCost || "0").toString(),
        type: "number_decimal",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "tax_percent",
        value: (config.taxPercent || "0").toString(),
        type: "number_decimal",
      },
      {
        ownerId: productId,
        namespace: "jewelry_config",
        key: "configured",
        value: "true",
        type: "boolean",
      },
    ];

    const result = await this.graphql(mutation, { metafields });

    if (result.metafieldsSet?.userErrors?.length > 0) {
      console.error("Metafield errors:", result.metafieldsSet.userErrors);
      throw new Error(JSON.stringify(result.metafieldsSet.userErrors));
    }

    return result.metafieldsSet;
  }

  /**
   * Get product configuration
   */
  async getProductConfiguration(productId) {
    const query = `
      query GetProductConfiguration($id: ID!) {
        product(id: $id) {
          id
          title
          status
          metafields(namespace: "jewelry_config", first: 20) {
            nodes {
              key
              value
            }
          }
        }
      }
    `;

    const result = await this.graphql(query, { id: productId });

    const config = {};
    result.product.metafields.nodes.forEach((field) => {
      const value = field.value;

      // Convert numeric strings to numbers
      if (
        [
          "metal_weight",
          "making_charge_percent",
          "labour_value",
          "wastage_value",
          "stone_weight",
          "stone_cost",
          "tax_percent",
        ].includes(field.key)
      ) {
        config[field.key] = parseFloat(value);
      } else if (field.key === "configured") {
        config[field.key] = value === "true";
      } else {
        config[field.key] = value;
      }
    });

    config.productId = result.product.id;
    config.productTitle = result.product.title;
    config.productStatus = result.product.status;

    return config;
  }

  /**
   * Get all configured products
   */
  async getConfiguredProducts() {
    const query = `
      query GetConfiguredProducts {
        products(first: 50) {
          nodes {
            id
            title
            status
            vendor
            variants(first: 1) {
              nodes {
                id
                price
              }
            }
            metafields(namespace: "jewelry_config", first: 20) {
              nodes {
                key
                value
              }
            }
          }
        }
      }
    `;

    const result = await this.graphql(query);

    return result.products.nodes.map((product) => {
      const config = {};
      product.metafields.nodes.forEach((field) => {
        if (
          [
            "metal_weight",
            "making_charge_percent",
            "labour_value",
            "wastage_value",
            "stone_weight",
            "stone_cost",
            "tax_percent",
          ].includes(field.key)
        ) {
          config[field.key] = parseFloat(field.value);
        } else if (field.key === "configured") {
          config[field.key] = field.value === "true";
        } else {
          config[field.key] = field.value;
        }
      });

      return {
        id: product.id,
        title: product.title,
        status: product.status,
        vendor: product.vendor,
        currentPrice: product.variants.nodes[0]?.price || "0",
        variantId: product.variants.nodes[0]?.id,
        configuration: config,
      };
    });
  }

  /**
   * Update product variant price
   */
  async updateProductPrice(variantId, newPrice) {
    // Use productUpdate mutation to update variant price
    const mutation = `
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Extract product ID from variant ID
    // variantId format: gid://shopify/ProductVariant/123456
    const variantNumericId = variantId.split("/").pop();
    const productIdMatch = variantId.match(
      /gid:\/\/shopify\/ProductVariant\/(\d+)/
    );

    // We need to get the product ID first
    // For now, let's use a simpler approach with the variants array
    const result = await this.graphql(mutation, {
      input: {
        id: variantId
          .replace("/ProductVariant/", "/Product/")
          .replace(/\/\d+$/, ""),
        variants: [
          {
            id: variantId,
            price: newPrice.toString(),
          },
        ],
      },
    });

    if (result.productUpdate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.productUpdate.userErrors));
    }

    return result.productUpdate;
  }

  /**
   * Bulk update all product prices based on new metal rates
   */
  async bulkUpdatePrices(newMetalRates, calculator) {
    const products = await this.getConfiguredProducts();
    const updates = [];

    for (const product of products) {
      try {
        // Skip products without configuration
        if (!product.configuration?.configured) {
          updates.push({
            productId: product.id,
            productTitle: product.title,
            success: false,
            error: "Product not configured",
          });
          continue;
        }

        // Calculate new price
        const priceBreakdown = calculator.calculatePrice({
          metalWeight: product.configuration.metal_weight,
          metalType: product.configuration.metal_type,
          makingChargePercent: product.configuration.making_charge_percent,
          labourType: product.configuration.labour_type,
          labourValue: product.configuration.labour_value,
          wastageType: product.configuration.wastage_type,
          wastageValue: product.configuration.wastage_value,
          stoneCost: product.configuration.stone_cost,
          taxPercent: product.configuration.tax_percent,
        });

        // Update variant price using productVariantsBulkUpdate
        const mutation = `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants {
                id
                price
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const result = await this.graphql(mutation, {
          productId: product.id,
          variants: [
            {
              id: product.variantId,
              price: priceBreakdown.finalPrice.toString(),
            },
          ],
        });

        if (result.productVariantsBulkUpdate?.userErrors?.length > 0) {
          throw new Error(
            JSON.stringify(result.productVariantsBulkUpdate.userErrors)
          );
        }

        updates.push({
          productId: product.id,
          productTitle: product.title,
          oldPrice: product.currentPrice,
          newPrice: priceBreakdown.finalPrice,
          success: true,
        });
      } catch (error) {
        updates.push({
          productId: product.id,
          productTitle: product.title,
          success: false,
          error: error.message,
        });
      }
    }

    return updates;
  }
}

export default ShopifyAPI;  