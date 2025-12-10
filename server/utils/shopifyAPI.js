import fetch from 'node-fetch';

/**
 * Shopify API Helper
 */
export class ShopifyAPI {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.apiVersion = '2024-10';
  }

  /**
   * Make GraphQL request to Shopify Admin API
   */
  async graphql(query, variables = {}) {
    const response = await fetch(
      `https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.accessToken,
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
      { key: 'gold_24kt', value: prices.gold24kt.toString() },
      { key: 'gold_22kt', value: prices.gold22kt.toString() },
      { key: 'gold_18kt', value: prices.gold18kt.toString() },
      { key: 'gold_14kt', value: prices.gold14kt.toString() },
      { key: 'platinum', value: prices.platinum.toString() },
      { key: 'silver', value: prices.silver.toString() },
      { key: 'last_updated', value: new Date().toISOString() }
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
        fields
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
          type: 'metal_prices',
          fields
        }
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
    
    if (!result.metaobjects || !result.metaobjects.nodes || result.metaobjects.nodes.length === 0) {
      return null;
    }

    const prices = {};
    result.metaobjects.nodes[0].fields.forEach(field => {
      if (field.key !== 'last_updated') {
        prices[field.key.replace(/_/g, '')] = parseFloat(field.value);
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
      { key: 'stone_id', value: stoneData.stoneId },
      { key: 'stone_type', value: stoneData.stoneType },
      { key: 'title', value: stoneData.title || '' },
      { key: 'clarity', value: stoneData.clarity || '' },
      { key: 'color', value: stoneData.color || '' },
      { key: 'shape', value: stoneData.shape || '' },
      { key: 'slabs', value: JSON.stringify(stoneData.slabs) }
    ];

    return await this.graphql(mutation, {
      metaobject: {
        type: 'stone_pricing',
        fields
      }
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
      { key: 'stone_id', value: stoneData.stoneId },
      { key: 'stone_type', value: stoneData.stoneType },
      { key: 'title', value: stoneData.title || '' },
      { key: 'clarity', value: stoneData.clarity || '' },
      { key: 'color', value: stoneData.color || '' },
      { key: 'shape', value: stoneData.shape || '' },
      { key: 'slabs', value: JSON.stringify(stoneData.slabs) }
    ];

    return await this.graphql(mutation, {
      id: stoneId,
      metaobject: {
        fields
      }
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
    
    return result.metaobjects.nodes.map(node => {
      const stone = {};
      node.fields.forEach(field => {
        if (field.key === 'slabs') {
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
    // Delete old stone metafields if we're saving a new stones array
    if (config.stones && Array.isArray(config.stones)) {
      // Build metafield identifiers for old stone metafields
      const oldStoneMetafieldIdentifiers = [
        {
          ownerId: productId,
          namespace: 'jewelry_config',
          key: 'stone_type'
        },
        {
          ownerId: productId,
          namespace: 'jewelry_config',
          key: 'stone_weight'
        },
        {
          ownerId: productId,
          namespace: 'jewelry_config',
          key: 'stone_cost'
        }
      ];
      
      // Delete old stone metafields
      const deleteMutation = `
        mutation DeleteMetafields($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            deletedMetafields {
              namespace
              key
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      
      try {
        const deleteResult = await this.graphql(deleteMutation, { metafields: oldStoneMetafieldIdentifiers });
        if (deleteResult.metafieldsDelete?.userErrors?.length > 0) {
          // Filter out errors for metafields that don't exist (which is fine)
          const realErrors = deleteResult.metafieldsDelete.userErrors.filter(
            err => !err.message?.includes('not found') && !err.message?.includes('does not exist')
          );
          if (realErrors.length > 0) {
            console.warn('Errors deleting old stone metafields:', realErrors);
          } else {
            console.log('Deleted old stone metafields (some may not have existed)');
          }
        } else {
          console.log('Deleted old stone metafields:', oldStoneMetafieldIdentifiers.length);
        }
      } catch (error) {
        console.warn('Could not delete old stone metafields:', error);
        // Continue anyway - new stones array will be saved
      }
    }
    
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

    // Helper function to normalize numeric values - ensures empty strings, null, undefined become '0'
    const normalizeNumericValue = (value) => {
      if (value === null || value === undefined || value === '' || isNaN(value)) {
        return '0';
      }
      const num = parseFloat(value);
      return isNaN(num) ? '0' : num.toString();
    };

    // Helper function to normalize text values - ensures null/undefined/empty become "none"
    // Shopify doesn't allow empty strings for text metafields
    const normalizeTextValue = (value, defaultValue = 'none') => {
      if (value === null || value === undefined || value === '') {
        return defaultValue;
      }
      return String(value);
    };

    const metafields = [
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'metal_weight',
        value: normalizeNumericValue(config.metalWeight),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'metal_type',
        value: normalizeTextValue(config.metalType || 'gold22kt'),
        type: 'single_line_text_field'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'making_charge_percent',
        value: normalizeNumericValue(config.makingChargePercent),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'labour_type',
        value: normalizeTextValue(config.labourType || 'percentage'),
        type: 'single_line_text_field'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'labour_value',
        value: normalizeNumericValue(config.labourValue),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'wastage_type',
        value: normalizeTextValue(config.wastageType || 'percentage'),
        type: 'single_line_text_field'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'wastage_value',
        value: normalizeNumericValue(config.wastageValue),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'stones',
        value: config.stones && Array.isArray(config.stones) ? JSON.stringify(config.stones) : '[]',
        type: 'json'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'net_weight',
        value: normalizeNumericValue(config.netWeight),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'gross_weight',
        value: normalizeNumericValue(config.grossWeight),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'tax_percent',
        value: normalizeNumericValue(config.taxPercent || 3),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'metal_rate',
        value: normalizeNumericValue(config.metalRate),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'metal_cost',
        value: normalizeNumericValue(config.metalCost),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'making_charge',
        value: normalizeNumericValue(config.makingCharge),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'labour_charge',
        value: normalizeNumericValue(config.labourCharge),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'wastage_charge',
        value: normalizeNumericValue(config.wastageCharge),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'tax_amount',
        value: normalizeNumericValue(config.taxAmount),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'product_code',
        value: normalizeTextValue(config.productCode, ''),
        type: 'single_line_text_field'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'configured',
        value: 'true',
        type: 'boolean'
      }
    ];

    const result = await this.graphql(mutation, { metafields });
    
    if (result.metafieldsSet?.userErrors?.length > 0) {
      console.error('Metafield errors:', result.metafieldsSet.userErrors);
      throw new Error(JSON.stringify(result.metafieldsSet.userErrors));
    }

    return result.metafieldsSet;
  }

  /**
   * Helper to find first variant with SKU
   */
  getSkuFromVariants(variants) {
    if (!variants || !variants.nodes || variants.nodes.length === 0) {
      return '';
    }
    const variantWithSku = variants.nodes.find(v => v.sku && v.sku.trim() !== '');
    return variantWithSku ? variantWithSku.sku : '';
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
          variants(first: 10) {
            nodes {
              id
              price
              sku
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
    `;

    const result = await this.graphql(query, { id: productId });
    
    const config = {};
    let hasStonesArray = false;
    
    // First pass: check if stones array exists
    result.product.metafields.nodes.forEach(field => {
      if (field.key === 'stones') {
        hasStonesArray = true;
      }
    });
    
    // Second pass: parse fields, ignoring old stone fields if stones array exists
    result.product.metafields.nodes.forEach(field => {
      const value = field.value;
      
      // Skip old stone fields if new stones array exists
      if (hasStonesArray && ['stone_type', 'stone_weight', 'stone_cost'].includes(field.key)) {
        return;
      }
      
      // Parse stones JSON array
      if (field.key === 'stones') {
        try {
          config[field.key] = JSON.parse(value || '[]');
        } catch (e) {
          config[field.key] = [];
        }
      }
      // Convert numeric strings to numbers
      else if (['metal_weight', 'making_charge_percent', 'labour_value', 
           'wastage_value', 'net_weight', 
           'gross_weight', 'tax_percent', 'metal_rate', 'metal_cost', 
           'making_charge', 'labour_charge', 'wastage_charge', 'tax_amount'].includes(field.key)) {
        config[field.key] = parseFloat(value);
      } else if (field.key === 'configured') {
        config[field.key] = value === 'true';
      } else if (!hasStonesArray || !['stone_type', 'stone_weight', 'stone_cost'].includes(field.key)) {
        // Only include old stone fields if stones array doesn't exist
        config[field.key] = value;
      }
    });

    config.productId = result.product.id;
    config.productTitle = result.product.title;
    config.productStatus = result.product.status;
    config.variantId = result.product.variants.nodes[0]?.id;
    config.currentPrice = result.product.variants.nodes[0]?.price || '0';
    config.sku = this.getSkuFromVariants(result.product.variants);

    return config;
  }

  /**
   * Get all configured products with pagination support
   * @param {string} cursor - Cursor for pagination (optional)
   * @param {number} limit - Number of products to fetch (default: 50)
   */
  async getConfiguredProducts(cursor = null, limit = 50) {
    // Build query with conditional cursor
    const query = cursor
      ? `
        query GetConfiguredProducts($cursor: String!, $limit: Int!) {
          products(first: $limit, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              status
              vendor
              variants(first: 10) {
                nodes {
                  id
                  price
                  sku
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
      `
      : `
        query GetConfiguredProducts($limit: Int!) {
          products(first: $limit) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              status
              vendor
              variants(first: 10) {
                nodes {
                  id
                  price
                  sku
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

    const variables = { limit };
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphql(query, variables);
    
    const products = result.products.nodes.map(product => {
      const config = {};
      let hasStonesArray = false;
      
      // First pass: check if stones array exists
      product.metafields.nodes.forEach(field => {
        if (field.key === 'stones') {
          hasStonesArray = true;
        }
      });
      
      // Second pass: parse fields, ignoring old stone fields if stones array exists
      product.metafields.nodes.forEach(field => {
        // Skip old stone fields if new stones array exists
        if (hasStonesArray && ['stone_type', 'stone_weight', 'stone_cost'].includes(field.key)) {
          return;
        }
        
        // Parse stones JSON array
        if (field.key === 'stones') {
          try {
            config[field.key] = JSON.parse(field.value || '[]');
          } catch (e) {
            config[field.key] = [];
          }
        }
        // Convert numeric strings to numbers
        else if (['metal_weight', 'making_charge_percent', 'labour_value', 
             'wastage_value', 'net_weight',
             'gross_weight', 'tax_percent', 'metal_rate', 'metal_cost',
             'making_charge', 'labour_charge', 'wastage_charge', 'tax_amount'].includes(field.key)) {
          config[field.key] = parseFloat(field.value);
        } else if (field.key === 'configured') {
          config[field.key] = field.value === 'true';
        } else if (!hasStonesArray || !['stone_type', 'stone_weight', 'stone_cost'].includes(field.key)) {
          // Only include old stone fields if stones array doesn't exist
          config[field.key] = field.value;
        }
      });

      return {
        id: product.id,
        title: product.title,
        status: product.status,
        vendor: product.vendor,
        currentPrice: product.variants.nodes[0]?.price || '0',
        variantId: product.variants.nodes[0]?.id,
        sku: this.getSkuFromVariants(product.variants),
        configuration: config
      };
    });

    return {
      products,
      pageInfo: result.products.pageInfo
    };
  }

  /**
   * Search products by query string
   */
  async searchProducts(query) {
    const graphqlQuery = `
      query SearchProducts($query: String!) {
        products(first: 50, query: $query) {
          nodes {
            id
            title
            status
            vendor
            variants(first: 10) {
              nodes {
                id
                price
                sku
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

    const result = await this.graphql(graphqlQuery, { query });
    
    return result.products.nodes.map(product => {
      const config = {};
      let hasStonesArray = false;
      
      // First pass: check if stones array exists
      product.metafields.nodes.forEach(field => {
        if (field.key === 'stones') {
          hasStonesArray = true;
        }
      });
      
      // Second pass: parse fields, ignoring old stone fields if stones array exists
      product.metafields.nodes.forEach(field => {
        // Skip old stone fields if new stones array exists
        if (hasStonesArray && ['stone_type', 'stone_weight', 'stone_cost'].includes(field.key)) {
          return;
        }
        
        // Parse stones JSON array
        if (field.key === 'stones') {
          try {
            config[field.key] = JSON.parse(field.value || '[]');
          } catch (e) {
            config[field.key] = [];
          }
        }
        // Convert numeric strings to numbers
        else if (['metal_weight', 'making_charge_percent', 'labour_value', 
             'wastage_value', 'net_weight',
             'gross_weight', 'tax_percent', 'metal_rate', 'metal_cost',
             'making_charge', 'labour_charge', 'wastage_charge', 'tax_amount'].includes(field.key)) {
          config[field.key] = parseFloat(field.value);
        } else if (field.key === 'configured') {
          config[field.key] = field.value === 'true';
        } else if (!hasStonesArray || !['stone_type', 'stone_weight', 'stone_cost'].includes(field.key)) {
          // Only include old stone fields if stones array doesn't exist
          config[field.key] = field.value;
        }
      });

      return {
        id: product.id,
        title: product.title,
        status: product.status,
        vendor: product.vendor,
        currentPrice: product.variants.nodes[0]?.price || '0',
        variantId: product.variants.nodes[0]?.id,
        sku: this.getSkuFromVariants(product.variants),
        configuration: config
      };
    });
  }

  /**
   * Update product variant price
   */
  async updateProductPrice(productId, variantId, newPrice) {
    // Use productVariantsBulkUpdate mutation to update variant price
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
      productId: productId,
      variants: [{
        id: variantId,
        price: newPrice.toString()
      }]
    });

    if (result.productVariantsBulkUpdate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.productVariantsBulkUpdate.userErrors));
    }

    return result.productVariantsBulkUpdate;
  }

  /**
   * Bulk update all product prices based on new metal rates
   */
  async bulkUpdatePrices(newMetalRates, calculator) {
    // Fetch all products by paginating through all pages
    let allProducts = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await this.getConfiguredProducts(cursor, 50);
      allProducts = allProducts.concat(result.products);
      hasNextPage = result.pageInfo.hasNextPage;
      cursor = result.pageInfo.endCursor;
    }

    const updates = [];

    for (const product of allProducts) {
      try {
        // Skip products without configuration
        if (!product.configuration?.configured) {
          updates.push({
            productId: product.id,
            productTitle: product.title,
            success: false,
            error: 'Product not configured'
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
          taxPercent: product.configuration.tax_percent
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
          variants: [{
            id: product.variantId,
            price: priceBreakdown.finalPrice.toString()
          }]
        });

        if (result.productVariantsBulkUpdate?.userErrors?.length > 0) {
          throw new Error(JSON.stringify(result.productVariantsBulkUpdate.userErrors));
        }

        updates.push({
          productId: product.id,
          productTitle: product.title,
          oldPrice: product.currentPrice,
          newPrice: priceBreakdown.finalPrice,
          success: true
        });
      } catch (error) {
        updates.push({
          productId: product.id,
          productTitle: product.title,
          success: false,
          error: error.message
        });
      }
    }

    return updates;
  }
}

export default ShopifyAPI;