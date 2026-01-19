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
   * Make GraphQL request to Shopify Admin API with retry logic for rate limiting
   * @param {string} query - GraphQL query
   * @param {Object} variables - Query variables
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<Object>} GraphQL response data
   */
  async graphql(query, variables = {}, retries = 3) {
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
    
    // Check for rate limiting errors
    if (result.errors) {
      const throttledError = result.errors.find(err => 
        err.extensions?.code === 'THROTTLED' || 
        err.message?.toLowerCase().includes('throttled')
      );
      
      if (throttledError && retries > 0) {
        // Calculate backoff delay (exponential backoff: 2^retries seconds, max 30s)
        const delay = Math.min(Math.pow(2, 4 - retries) * 1000, 30000);
        
        // Check for Retry-After header
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Retry the request
        return this.graphql(query, variables, retries - 1);
      }
      
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
        key: 'subtotal',
        value: normalizeNumericValue(config.subtotal),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'discounted_subtotal',
        value: normalizeNumericValue(config.discountedSubtotal || config.subtotal),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'price_before_discount',
        value: normalizeNumericValue(config.priceBeforeDiscount || config.finalPrice),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'tax_amount_before_discount',
        value: normalizeNumericValue(config.taxAmountBeforeDiscount || config.taxAmount),
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
   * Update only price-related metafields (used during refresh prices)
   * @param {string} productId - Product ID
   * @param {Object} priceBreakdown - Price breakdown from calculator
   */
  async updateProductPriceMetafields(productId, priceBreakdown) {
    // Helper function to normalize numeric values
    const normalizeNumericValue = (value) => {
      if (value === null || value === undefined || value === '' || isNaN(value)) {
        return '0';
      }
      const num = parseFloat(value);
      return isNaN(num) ? '0' : num.toString();
    };

    const mutation = `
      mutation UpdatePriceMetafields($metafields: [MetafieldsSetInput!]!) {
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
        namespace: 'jewelry_config',
        key: 'metal_rate',
        value: normalizeNumericValue(priceBreakdown.metalRate),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'metal_cost',
        value: normalizeNumericValue(priceBreakdown.metalCost),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'making_charge',
        value: normalizeNumericValue(priceBreakdown.makingCharge),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'labour_charge',
        value: normalizeNumericValue(priceBreakdown.labourCharge),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'wastage_charge',
        value: normalizeNumericValue(priceBreakdown.wastageCharge),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'tax_amount',
        value: normalizeNumericValue(priceBreakdown.taxAmount),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'subtotal',
        value: normalizeNumericValue(priceBreakdown.subtotal),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'discounted_subtotal',
        value: normalizeNumericValue(priceBreakdown.discountedSubtotal || priceBreakdown.subtotal),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'price_before_discount',
        value: normalizeNumericValue(priceBreakdown.priceBeforeDiscount || priceBreakdown.finalPrice),
        type: 'number_decimal'
      },
      {
        ownerId: productId,
        namespace: 'jewelry_config',
        key: 'tax_amount_before_discount',
        value: normalizeNumericValue(priceBreakdown.taxAmountBeforeDiscount || priceBreakdown.taxAmount),
        type: 'number_decimal'
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
          metafields(namespace: "jewelry_config", first: 50) {
            nodes {
              key
              value
            }
          }
          discountMetafield: metafield(namespace: "pricing", key: "discount") {
            id
            value
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
        // Handle both string 'true' and boolean true values
        config[field.key] = value === 'true' || value === true || value === '1' || 
                           (typeof value === 'string' && value.toLowerCase() === 'true');
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

    // Parse discount metafield if it exists
    if (result.product.discountMetafield?.value) {
      try {
        const discountValue = JSON.parse(result.product.discountMetafield.value);
        // Only include discount if it's enabled
        if (discountValue.enabled) {
          config.discount = discountValue;
        }
      } catch (e) {
        console.error('Error parsing discount metafield:', e);
        // If parsing fails, don't include discount
      }
    }

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
              metafields(namespace: "jewelry_config", first: 50) {
                nodes {
                  key
                  value
                }
              }
              discountMetafield: metafield(namespace: "pricing", key: "discount") {
                id
                value
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
              metafields(namespace: "jewelry_config", first: 50) {
                nodes {
                  key
                  value
                }
              }
              discountMetafield: metafield(namespace: "pricing", key: "discount") {
                id
                value
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
          // Handle both string 'true' and boolean true values
          const value = field.value;
          config[field.key] = value === 'true' || value === true || value === '1' || 
                             (typeof value === 'string' && value.toLowerCase() === 'true');
        } else if (!hasStonesArray || !['stone_type', 'stone_weight', 'stone_cost'].includes(field.key)) {
          // Only include old stone fields if stones array doesn't exist
          config[field.key] = field.value;
        }
      });

      // Parse discount metafield if it exists
      if (product.discountMetafield?.value) {
        try {
          const discountValue = JSON.parse(product.discountMetafield.value);
          // Only include discount if it's enabled
          if (discountValue.enabled) {
            config.discount = discountValue;
          }
        } catch (e) {
          // If parsing fails, don't include discount
        }
      }

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
            metafields(namespace: "jewelry_config", first: 50) {
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
          // Handle both string 'true' and boolean true values
          config[field.key] = field.value === 'true' || field.value === true || field.value === '1';
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
   * Process a single product update
   * @private
   */
  async processProductUpdate(product, calculator, stonePricing, discountCache, logger) {
    try {
      // Skip products without configuration
      if (!product.configuration?.configured) {
        return {
          productId: product.id,
          productTitle: product.title,
          sku: product.sku || '',
          success: false,
          error: 'Product not configured'
        };
      }

      // Calculate total stone cost from stones array or fall back to old stone_cost field
      let totalStoneCost = 0;
      if (product.configuration.stones && Array.isArray(product.configuration.stones) && product.configuration.stones.length > 0) {
        // Sum all stoneCost values from the stones array
        totalStoneCost = product.configuration.stones.reduce((sum, stone) => {
          return sum + (parseFloat(stone.stoneCost) || 0);
        }, 0);
      } else {
        // Fall back to old stone_cost field for backward compatibility
        totalStoneCost = parseFloat(product.configuration.stone_cost) || 0;
      }
      
      // Build config for price calculation
      const priceConfig = {
        metalWeight: product.configuration.metal_weight,
        metalType: product.configuration.metal_type,
        makingChargePercent: product.configuration.making_charge_percent,
        labourType: product.configuration.labour_type,
        labourValue: product.configuration.labour_value,
        wastageType: product.configuration.wastage_type,
        wastageValue: product.configuration.wastage_value,
        stoneCost: totalStoneCost,
        taxPercent: product.configuration.tax_percent,
        stones: product.configuration.stones || [] // Include stones array for product type detection
      };
      
      // Check if product has an existing discount
      let discountConfig = null;
      
      if (product.configuration.discount && product.configuration.discount.enabled && product.configuration.discount.discount_id) {
        const discountId = product.configuration.discount.discount_id;
        
        // Check cache first
        if (!discountCache.has(discountId)) {
          try {
            // Fetch the full discount rules from discount_id
            const discountRules = await this.getDiscountRuleById(discountId);
            if (discountRules) {
              // Store in cache
              discountCache.set(discountId, discountRules);
            }
          } catch (error) {
            logger?.warn(`Error fetching discount rules for product ${product.id}`, { 
              productId: product.id, 
              discountId, 
              error: error.message 
            });
            // Continue without discount if fetching fails
          }
        }
        
        // Get discount rules from cache
        const discountRules = discountCache.get(discountId);
        if (discountRules) {
          // Convert discount rules to discount config format based on applied_rule
          const appliedRule = product.configuration.discount.applied_rule || 'gold';
          if (appliedRule === 'gold' && discountRules.gold_rules) {
            discountConfig = {
              enabled: true,
              goldRules: discountRules.gold_rules
            };
          } else if (appliedRule === 'diamond' && discountRules.diamond_rules) {
            discountConfig = {
              enabled: true,
              diamondRules: discountRules.diamond_rules
            };
          } else if (appliedRule === 'silver' && discountRules.silver_rules) {
            discountConfig = {
              enabled: true,
              silverRules: discountRules.silver_rules
            };
          }
        }
      }
      
      // Calculate price with or without discount
      const finalPriceBreakdown = calculator.calculatePrice(priceConfig, discountConfig, stonePricing);
      
      // Use finalPriceAfterDiscount if discount was applied, otherwise use finalPrice
      const finalPrice = finalPriceBreakdown.finalPriceAfterDiscount || finalPriceBreakdown.finalPrice;
      
      // Round final price up to nearest integer
      const roundedPrice = Math.ceil(finalPrice);

      // Update price-related metafields so frontend displays correct values
      try {
        await this.updateProductPriceMetafields(product.id, finalPriceBreakdown);
      } catch (metafieldError) {
        // Check if it's a throttling error - if so, we'll retry the whole product update
        const isThrottled = metafieldError.message?.includes('Throttled') || 
                            metafieldError.message?.includes('THROTTLED');
        
        if (isThrottled) {
          logger?.warn(`Throttled while updating metafields for product ${product.id}, will retry`, {
            productId: product.id
          });
          // Wait a bit and retry the metafield update (optimized from 2000ms to 1000ms)
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            await this.updateProductPriceMetafields(product.id, finalPriceBreakdown);
          } catch (retryError) {
            logger?.warn(`Failed to update metafields for product ${product.id} after retry`, {
              productId: product.id,
              error: retryError.message
            });
            // Continue with price update even if metafield update fails
          }
        } else {
          logger?.warn(`Failed to update metafields for product ${product.id}`, {
            productId: product.id,
            error: metafieldError.message
          });
          // Continue with price update even if metafield update fails
        }
      }
      
      // Update discount metafield with new discount amount if discount was applied
      if (discountConfig && finalPriceBreakdown.discount) {
        try {
          const discountAmount = finalPriceBreakdown.discount.discountAmount || 0;
          const updatedDiscountMetafield = {
            ...product.configuration.discount,
            discount_amount: discountAmount,
            applied_at: new Date().toISOString()
          };
          await this.updateProductDiscount(product.id, updatedDiscountMetafield);
        } catch (discountError) {
          // Check if it's a throttling error
          const isThrottled = discountError.message?.includes('Throttled') || 
                              discountError.message?.includes('THROTTLED');
          
          if (isThrottled) {
            logger?.warn(`Throttled while updating discount metafield for product ${product.id}`, {
              productId: product.id
            });
            // Wait and retry (optimized from 2000ms to 1000ms)
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              const discountAmount = finalPriceBreakdown.discount.discountAmount || 0;
              const updatedDiscountMetafield = {
                ...product.configuration.discount,
                discount_amount: discountAmount,
                applied_at: new Date().toISOString()
              };
              await this.updateProductDiscount(product.id, updatedDiscountMetafield);
            } catch (retryError) {
              logger?.warn(`Failed to update discount metafield for product ${product.id} after retry`, {
                productId: product.id,
                error: retryError.message
              });
            }
          } else {
            logger?.warn(`Failed to update discount metafield for product ${product.id}`, {
              productId: product.id,
              error: discountError.message
            });
          }
          // Continue with price update even if discount metafield update fails
        }
      }

      // Update variant price using productVariantsBulkUpdate
      // This already uses graphql() which has retry logic, but we'll add extra handling here too
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

      let result;
      let retries = 2;
      while (retries >= 0) {
        try {
          result = await this.graphql(mutation, {
            productId: product.id,
            variants: [{
              id: product.variantId,
              price: roundedPrice.toString()
            }]
          });
          break; // Success, exit retry loop
        } catch (error) {
          const isThrottled = error.message?.includes('Throttled') || 
                             error.message?.includes('THROTTLED');
          
          if (isThrottled && retries > 0) {
            logger?.warn(`Throttled while updating variant price for product ${product.id}, retrying...`, {
              productId: product.id,
              retriesLeft: retries
            });
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, 2 - retries) * 1000));
            retries--;
          } else {
            throw error; // Re-throw if not throttled or out of retries
          }
        }
      }

      if (result.productVariantsBulkUpdate?.userErrors?.length > 0) {
        throw new Error(JSON.stringify(result.productVariantsBulkUpdate.userErrors));
      }

      return {
        productId: product.id,
        productTitle: product.title,
        sku: product.sku || '',
        oldPrice: product.currentPrice,
        newPrice: roundedPrice,
        success: true
      };
    } catch (error) {
      return {
        productId: product.id,
        productTitle: product.title,
        sku: product.sku || '',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Bulk update all product prices based on new metal rates
   * Optimized with parallel batch processing and caching
   * @param {Object} newMetalRates - New metal rates
   * @param {Object} calculator - Price calculator instance
   * @param {Function} progressCallback - Optional callback for progress updates (processed, total, updates)
   * @param {Object} logger - Optional logger instance
   * @returns {Promise<Array>} Array of update results
   */
  async bulkUpdatePrices(newMetalRates, calculator, progressCallback = null, logger = null) {
    // Fetch all products by paginating through all pages
    let allProducts = [];
    let cursor = null;
    let hasNextPage = true;

    logger?.info('Starting bulk price update - fetching all products', {});
    
    while (hasNextPage) {
      const result = await this.getConfiguredProducts(cursor, 50);
      allProducts = allProducts.concat(result.products);
      hasNextPage = result.pageInfo.hasNextPage;
      cursor = result.pageInfo.endCursor;
    }

    logger?.info('Fetched all products', { totalProducts: allProducts.length });

    // Fetch stone pricing once (was being fetched 1000+ times before)
    const stonePricing = await this.getAllStonePricing();
    logger?.info('Fetched stone pricing', { stoneCount: stonePricing.length });

    // Pre-fetch all discount rules and populate cache
    const discountCache = new Map();
    try {
      const allDiscountRules = await this.getAllDiscountRules();
      allDiscountRules.forEach(rule => {
        discountCache.set(rule.id, rule);
      });
      logger?.info('Pre-fetched all discount rules', { discountCount: allDiscountRules.length });
    } catch (error) {
      logger?.warn('Error pre-fetching discount rules, will fetch on-demand', { error: error.message });
    }

    const updates = [];
    const totalProducts = allProducts.length;
    // Optimized batch size and concurrency for better performance
    const BATCH_SIZE = 12; // Process 12 products in parallel per batch (increased from 5)
    const CONCURRENT_BATCHES = 2; // Process 2 batches concurrently (increased from 1)
    
    // Adaptive rate limiting
    let baseDelay = 250; // Base delay between batch groups (reduced from 500ms)
    let throttleCount = 0; // Track throttling occurrences

    // Process products in batches
    for (let i = 0; i < allProducts.length; i += BATCH_SIZE * CONCURRENT_BATCHES) {
      // Create batches for concurrent processing
      const batchPromises = [];
      
      for (let j = 0; j < CONCURRENT_BATCHES && (i + j * BATCH_SIZE) < allProducts.length; j++) {
        const batchStart = i + j * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, allProducts.length);
        const batch = allProducts.slice(batchStart, batchEnd);
        
        // Process batch in parallel (all products at once)
        const batchPromise = Promise.all(
          batch.map(async (product) => {
            try {
              const result = await this.processProductUpdate(product, calculator, stonePricing, discountCache, logger);
              return result;
            } catch (error) {
              return {
                productId: product.id,
                productTitle: product.title,
                sku: product.sku || '',
                success: false,
                error: error.message
              };
            }
          })
        );
        
        batchPromises.push(batchPromise);
      }

      // Wait for all concurrent batches to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Flatten results and check for throttling
      let batchThrottled = false;
      for (const batchResult of batchResults) {
        updates.push(...batchResult);
        // Check if any product in this batch was throttled
        if (batchResult.some(r => r.error && (r.error.includes('Throttled') || r.error.includes('THROTTLED')))) {
          batchThrottled = true;
        }
      }

      // Adaptive delay adjustment based on throttling
      if (batchThrottled) {
        throttleCount++;
        baseDelay = Math.min(baseDelay * 1.5, 1000); // Increase delay, max 1 second
        logger?.warn('Throttling detected, increasing delay', { 
          newDelay: baseDelay, 
          throttleCount 
        });
      } else if (throttleCount > 0 && throttleCount % 3 === 0) {
        // Gradually decrease delay after 3 successful batches
        baseDelay = Math.max(baseDelay * 0.9, 200); // Decrease delay, min 200ms
        logger?.info('Reducing delay after successful batches', { newDelay: baseDelay });
      }

      const processed = Math.min(i + BATCH_SIZE * CONCURRENT_BATCHES, totalProducts);
      
      // Call progress callback if provided
      if (progressCallback) {
        progressCallback(processed, totalProducts, updates);
      }

      logger?.info('Batch progress', {
        processed,
        total: totalProducts,
        percentage: Math.round((processed / totalProducts) * 100),
        successCount: updates.filter(u => u.success).length,
        failCount: updates.filter(u => !u.success).length,
        currentDelay: baseDelay
      });

      // Adaptive delay between batch groups
      if (i + BATCH_SIZE * CONCURRENT_BATCHES < allProducts.length) {
        await new Promise(resolve => setTimeout(resolve, baseDelay));
      }
    }

    logger?.info('Bulk price update completed', {
      total: totalProducts,
      success: updates.filter(u => u.success).length,
      failed: updates.filter(u => !u.success).length
    });

    return updates;
  }

  /**
   * Create discount rule metaobject (old format - for backward compatibility)
   */
  async createDiscountRule(discountData) {
    const mutation = `
      mutation CreateDiscountRule($metaobject: MetaobjectCreateInput!) {
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
      { key: 'rule_name', value: discountData.ruleName },
      { key: 'product_type', value: discountData.productType }, // gold, diamond, silver
      { key: 'discount_type', value: discountData.discountType }, // percentage, fixed, slab
      { key: 'discount_value', value: discountData.discountValue?.toString() || '0' },
      { key: 'weight_slabs', value: JSON.stringify(discountData.weightSlabs || []) },
      { key: 'is_active', value: discountData.isActive?.toString() || 'true' },
      { key: 'created_at', value: new Date().toISOString() }
    ];

    return await this.graphql(mutation, {
      metaobject: {
        type: 'discount_rules',
        fields
      }
    });
  }

  /**
   * Create unified discount (new format with all 3 product types)
   */
  async createDiscount(discountData) {
    const mutation = `
      mutation CreateDiscount($metaobject: MetaobjectCreateInput!) {
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
      { key: 'discount_title', value: discountData.discount_title },
      { key: 'application_type', value: discountData.application_type },
      { key: 'target_collection_id', value: discountData.target_collection_id || '' },
      { key: 'target_product_ids', value: JSON.stringify(discountData.target_product_ids || []) },
      { key: 'gold_rules', value: JSON.stringify(discountData.gold_rules || {}) },
      { key: 'diamond_rules', value: JSON.stringify(discountData.diamond_rules || {}) },
      { key: 'silver_rules', value: JSON.stringify(discountData.silver_rules || {}) },
      { key: 'is_active', value: (discountData.is_active !== undefined ? discountData.is_active : true).toString() },
      { key: 'created_at', value: discountData.created_at || new Date().toISOString() },
      { key: 'last_applied', value: discountData.last_applied || '' }
    ];

    return await this.graphql(mutation, {
      metaobject: {
        type: 'discount_rules',
        fields
      }
    });
  }

  /**
   * Update discount rule metaobject (old format - for backward compatibility)
   */
  async updateDiscountRule(ruleId, discountData) {
    const mutation = `
      mutation UpdateDiscountRule($id: ID!, $metaobject: MetaobjectUpdateInput!) {
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
      { key: 'rule_name', value: discountData.ruleName },
      { key: 'product_type', value: discountData.productType },
      { key: 'discount_type', value: discountData.discountType },
      { key: 'discount_value', value: discountData.discountValue?.toString() || '0' },
      { key: 'weight_slabs', value: JSON.stringify(discountData.weightSlabs || []) },
      { key: 'is_active', value: discountData.isActive?.toString() || 'true' }
    ];

    return await this.graphql(mutation, {
      id: ruleId,
      metaobject: {
        fields
      }
    });
  }

  /**
   * Update unified discount (new format)
   */
  async updateDiscount(ruleId, discountData) {
    const mutation = `
      mutation UpdateDiscount($id: ID!, $metaobject: MetaobjectUpdateInput!) {
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
      { key: 'discount_title', value: discountData.discount_title },
      { key: 'application_type', value: discountData.application_type },
      { key: 'target_collection_id', value: discountData.target_collection_id || '' },
      { key: 'target_product_ids', value: JSON.stringify(discountData.target_product_ids || []) },
      { key: 'gold_rules', value: JSON.stringify(discountData.gold_rules || {}) },
      { key: 'diamond_rules', value: JSON.stringify(discountData.diamond_rules || {}) },
      { key: 'silver_rules', value: JSON.stringify(discountData.silver_rules || {}) },
      { key: 'is_active', value: (discountData.is_active !== undefined ? discountData.is_active : true).toString() },
      { key: 'last_applied', value: discountData.last_applied || '' }
    ];

    return await this.graphql(mutation, {
      id: ruleId,
      metaobject: {
        fields
      }
    });
  }

  /**
   * Get single discount rule by ID
   */
  async getDiscountRule(ruleId) {
    const query = `
      query GetDiscountRule($id: ID!) {
        metaobject(id: $id) {
          id
          handle
          fields {
            key
            value
          }
        }
      }
    `;

    const result = await this.graphql(query, { id: ruleId });
    
    if (!result.metaobject) {
      return null;
    }

    const rule = { id: result.metaobject.id, handle: result.metaobject.handle };
    result.metaobject.fields.forEach(field => {
      if (['gold_rules', 'diamond_rules', 'silver_rules', 'target_product_ids', 'weight_slabs'].includes(field.key)) {
        try {
          rule[field.key] = JSON.parse(field.value || '[]');
        } catch {
          rule[field.key] = field.value ? JSON.parse(field.value) : (field.key === 'target_product_ids' ? [] : {});
        }
      } else if (field.key === 'is_active') {
        rule[field.key] = field.value === 'true';
      } else {
        rule[field.key] = field.value;
      }
    });

    return rule;
  }

  /**
   * Get all discount rules (supports both old and new format)
   */
  async getDiscountRules() {
    const query = `
      query GetDiscountRules {
        metaobjects(type: "discount_rules", first: 50) {
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
    
    if (!result.metaobjects || !result.metaobjects.nodes) {
      return [];
    }

    return result.metaobjects.nodes.map(node => {
      const rule = { id: node.id, handle: node.handle };
      node.fields.forEach(field => {
        // JSON fields
        if (['gold_rules', 'diamond_rules', 'silver_rules', 'target_product_ids', 'weight_slabs'].includes(field.key)) {
          try {
            rule[field.key] = JSON.parse(field.value || (field.key === 'target_product_ids' ? '[]' : '{}'));
          } catch {
            rule[field.key] = field.key === 'target_product_ids' ? [] : {};
          }
        } 
        // Boolean fields
        else if (field.key === 'is_active') {
          rule[field.key] = field.value === 'true';
        } 
        // Numeric fields
        else if (field.key === 'discount_value') {
          rule[field.key] = parseFloat(field.value) || 0;
        } 
        // String fields
        else {
          rule[field.key] = field.value;
        }
      });
      return rule;
    });
  }

  /**
   * Get all discount rules with pagination
   * Used for pre-fetching all discount rules before bulk processing
   */
  async getAllDiscountRules() {
    let allRules = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const query = `
        query GetAllDiscountRules($after: String) {
          metaobjects(type: "discount_rules", first: 50, after: $after) {
            nodes {
              id
              handle
              fields {
                key
                value
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const result = await this.graphql(query, { after: cursor });
      
      if (!result.metaobjects || !result.metaobjects.nodes) {
        break;
      }

      const rules = result.metaobjects.nodes.map(node => {
        const rule = { id: node.id, handle: node.handle };
        node.fields.forEach(field => {
          // JSON fields
          if (['gold_rules', 'diamond_rules', 'silver_rules', 'target_product_ids', 'weight_slabs'].includes(field.key)) {
            try {
              rule[field.key] = JSON.parse(field.value || (field.key === 'target_product_ids' ? '[]' : '{}'));
            } catch {
              rule[field.key] = field.key === 'target_product_ids' ? [] : {};
            }
          } 
          // Boolean fields
          else if (field.key === 'is_active') {
            rule[field.key] = field.value === 'true';
          } 
          // Numeric fields
          else if (field.key === 'discount_value') {
            rule[field.key] = parseFloat(field.value) || 0;
          } 
          // String fields
          else {
            rule[field.key] = field.value;
          }
        });
        return rule;
      });

      allRules = allRules.concat(rules);
      hasNextPage = result.metaobjects.pageInfo.hasNextPage;
      cursor = result.metaobjects.pageInfo.endCursor;
    }

    return allRules;
  }

  /**
   * Get a single discount rule by ID
   */
  async getDiscountRuleById(discountId) {
    const query = `
      query GetDiscountRule($id: ID!) {
        metaobject(id: $id) {
          id
          handle
          fields {
            key
            value
          }
        }
      }
    `;

    const result = await this.graphql(query, { id: discountId });
    
    if (!result.metaobject) {
      return null;
    }

    const rule = { id: result.metaobject.id, handle: result.metaobject.handle };
    result.metaobject.fields.forEach(field => {
      // JSON fields
      if (['gold_rules', 'diamond_rules', 'silver_rules', 'target_product_ids', 'weight_slabs'].includes(field.key)) {
        try {
          rule[field.key] = JSON.parse(field.value || (field.key === 'target_product_ids' ? '[]' : '{}'));
        } catch {
          rule[field.key] = field.key === 'target_product_ids' ? [] : {};
        }
      } 
      // Boolean fields
      else if (field.key === 'is_active') {
        rule[field.key] = field.value === 'true';
      } 
      // Numeric fields
      else if (field.key === 'discount_value') {
        rule[field.key] = parseFloat(field.value) || 0;
      } 
      // String fields
      else {
        rule[field.key] = field.value;
      }
    });
    
    return rule;
  }

  /**
   * Delete discount rule
   */
  async deleteDiscountRule(ruleId) {
    const mutation = `
      mutation DeleteDiscountRule($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    return await this.graphql(mutation, { id: ruleId });
  }

  /**
   * Update product's discount metafield
   */
  async updateProductDiscount(productId, discountConfig) {
    const mutation = `
      mutation UpdateProductDiscount($metafields: [MetafieldsSetInput!]!) {
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
        namespace: 'pricing',
        key: 'discount',
        type: 'json',
        value: JSON.stringify(discountConfig)
      }
    ];

    return await this.graphql(mutation, { metafields });
  }

  /**
   * Get Shopify collections
   */
  async getCollections(first = 50) {
    const query = `
      query GetCollections($first: Int!) {
        collections(first: $first) {
          edges {
            node {
              id
              title
              handle
              productsCount {
                count
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const result = await this.graphql(query, { first });
    
    return {
      collections: result.collections.edges.map(edge => ({
        ...edge.node,
        productsCount: edge.node.productsCount?.count || 0
      })),
      pageInfo: result.collections.pageInfo
    };
  }

  /**
   * Get products in a collection
   */
  async getCollectionProducts(collectionId, first = 50) {
    const query = `
      query GetCollectionProducts($id: ID!, $first: Int!) {
        collection(id: $id) {
          id
          title
          products(first: $first) {
            edges {
              node {
                id
                title
                status
                vendor
                variants(first: 1) {
                  edges {
                    node {
                      id
                      price
                      sku
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const result = await this.graphql(query, { id: collectionId, first });
    
    if (!result.collection) {
      return { products: [], pageInfo: {} };
    }

    const products = result.collection.products.edges.map(edge => {
      const product = edge.node;
      const variant = product.variants.edges[0]?.node;
      
      return {
        id: product.id,
        title: product.title,
        status: product.status,
        vendor: product.vendor,
        variantId: variant?.id,
        price: variant?.price,
        sku: variant?.sku
      };
    });

    return {
      products,
      pageInfo: result.collection.products.pageInfo
    };
  }

  /**
   * Bulk apply discount to multiple products
   */
  async bulkApplyDiscount(productIds, discountConfig, priceCalculator) {
    const results = [];

    for (const productId of productIds) {
      try {
        // Get product configuration
        const config = await this.getProductConfiguration(productId);
        
        if (!config.configured) {
          results.push({
            productId,
            success: false,
            error: 'Product not configured'
          });
          continue;
        }

        // Update discount metafield
        await this.updateProductDiscount(productId, discountConfig);

        // Fetch stone pricing for accurate product type detection
        const stonePricing = await this.getAllStonePricing();

        // Recalculate price with discount
        const priceBreakdown = priceCalculator.calculatePrice(config, discountConfig, stonePricing);
        const roundedPrice = Math.ceil(priceBreakdown.finalPriceAfterDiscount || priceBreakdown.finalPrice);

        // Update product price
        if (config.variantId) {
          await this.updateProductPrice(productId, config.variantId, roundedPrice);
        }

        results.push({
          productId,
          success: true,
          newPrice: roundedPrice,
          discountAmount: priceBreakdown.discount?.discountAmount || 0
        });
      } catch (error) {
        results.push({
          productId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Search products by SKU
   * @param {string} query - SKU search query
   * @returns {Promise<Array>} - Array of matching products
   */
  async searchProductsBySku(query) {
    const graphqlQuery = `
      query SearchBySku($query: String!) {
        products(first: 50, query: $query) {
          edges {
            node {
              id
              title
              status
              vendor
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                    price
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.graphql(graphqlQuery, { query: `sku:${query}*` });
    
    // Flatten products with their variants
    const products = [];
    result.products.edges.forEach(edge => {
      const product = edge.node;
      product.variants.edges.forEach(variantEdge => {
        const variant = variantEdge.node;
        if (variant.sku && variant.sku.toLowerCase().includes(query.toLowerCase())) {
          products.push({
            id: product.id,
            title: product.title,
            status: product.status,
            vendor: product.vendor,
            variantId: variant.id,
            sku: variant.sku,
            price: variant.price
          });
        }
      });
    });

    return products;
  }

  /**
   * Find product by exact SKU
   * @param {string} sku - Exact SKU to find
   * @returns {Promise<Object|null>} - Product object or null if not found
   */
  async findProductBySku(sku) {
    const products = await this.searchProductsBySku(sku);
    return products.find(p => p.sku === sku) || null;
  }

  /**
   * Get product by ID (for application engine)
   * @param {string} productId - Product ID
   * @returns {Promise<Object>} - Product object
   */
  async getProduct(productId) {
    const query = `
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          status
          vendor
          variants(first: 1) {
            edges {
              node {
                id
                sku
                price
              }
            }
          }
        }
      }
    `;

    const result = await this.graphql(query, { id: productId });
    
    if (!result.product) {
      return null;
    }

    const variant = result.product.variants.edges[0]?.node;
    
    return {
      id: result.product.id,
      title: result.product.title,
      status: result.product.status,
      vendor: result.product.vendor,
      sku: variant?.sku,
      price: variant?.price
    };
  }
}

export default ShopifyAPI;