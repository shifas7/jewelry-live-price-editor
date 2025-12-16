import { getPriceCalculator, getShopifyAPI } from '../middleware/calculatorInit.js';

/**
 * Get all configured products with pagination
 */
export async function getProducts(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const cursor = req.query.cursor || null;
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await shopifyAPI.getConfiguredProducts(cursor, limit);
    
    res.json({
      success: true,
      data: result.products,
      pageInfo: result.pageInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get specific product configuration
 */
export async function getProductConfiguration(req, res) {
  try {
    const productId = req.params.id;
    const shopifyAPI = getShopifyAPI();
    const config = await shopifyAPI.getProductConfiguration(productId);
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Configure product pricing parameters
 */
export async function configureProduct(req, res) {
  try {
    const productId = req.params.id;
    const config = req.body;
    const priceCalculator = getPriceCalculator();
    const shopifyAPI = getShopifyAPI();

    // Helper function to normalize numeric values (empty string, null, undefined -> 0)
    const normalizeNumeric = (value) => {
      if (value === null || value === undefined || value === '' || isNaN(value)) {
        return 0;
      }
      return parseFloat(value) || 0;
    };

    // Only metalWeight and metalType are truly required
    if (!config.metalWeight || config.metalWeight === '') {
      return res.status(400).json({
        success: false,
        error: 'Metal weight is required'
      });
    }

    if (!config.metalType || config.metalType === '') {
      return res.status(400).json({
        success: false,
        error: 'Metal type is required'
      });
    }

    // Process stones array - calculate total stone cost
    let stones = [];
    let totalStoneCost = 0;
    
    if (config.stones && Array.isArray(config.stones)) {
      stones = config.stones.map(stone => ({
        stoneType: stone.stoneType || '', // stone_id
        actualStoneType: stone.actualStoneType || '', // actual type
        stoneWeight: normalizeNumeric(stone.stoneWeight),
        stoneCost: normalizeNumeric(stone.stoneCost),
        stoneCount: parseInt(stone.stoneCount) || 1
      }));
      
      // Calculate total stone cost from all stones
      totalStoneCost = stones.reduce((sum, stone) => sum + stone.stoneCost, 0);
    }

    // Process discount configuration if provided
    let discountConfig = null;
    if (config.discount && config.discount.enabled) {
      // Check if discount has discount_id (unified format) - fetch full discount rules
      if (config.discount.discount_id) {
        try {
          // Fetch the full discount rules from discount_id
          const discountRules = await shopifyAPI.getDiscountRuleById(config.discount.discount_id);
          if (discountRules) {
            // Convert discount rules to discount config format based on applied_rule
            const appliedRule = config.discount.applied_rule || 'gold';
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
        } catch (error) {
          console.error('Error fetching discount rules:', error);
          // Fall back to old format if fetching fails
          discountConfig = {
            enabled: true,
            discountType: config.discount.discountType || 'percentage',
            discountValue: normalizeNumeric(config.discount.discountValue),
            weightSlabs: config.discount.weightSlabs || []
          };
        }
      } else {
        // Old format - use discount as-is
        discountConfig = {
          enabled: true,
          discountType: config.discount.discountType || 'percentage',
          discountValue: normalizeNumeric(config.discount.discountValue),
          weightSlabs: config.discount.weightSlabs || []
        };
      }
    }

    // Normalize all numeric fields to default to 0 if empty
    const normalizedConfig = {
      metalWeight: normalizeNumeric(config.metalWeight),
      metalType: config.metalType || 'gold22kt',
      makingChargePercent: normalizeNumeric(config.makingChargePercent),
      labourType: config.labourType || 'percentage',
      labourValue: normalizeNumeric(config.labourValue),
      wastageType: config.wastageType || 'percentage',
      wastageValue: normalizeNumeric(config.wastageValue),
      stones: stones, // Include stones array
      stoneCost: totalStoneCost, // Total stone cost for price calculation
      netWeight: normalizeNumeric(config.netWeight),
      grossWeight: normalizeNumeric(config.grossWeight),
      taxPercent: normalizeNumeric(config.taxPercent) || 3 // Default tax to 3% if not provided
    };

    // Fetch stone pricing for accurate product type detection
    const stonePricing = await shopifyAPI.getAllStonePricing();
    
    // Calculate price with current rates (including discount if provided)
    const priceBreakdown = priceCalculator.calculatePrice(normalizedConfig, discountConfig, stonePricing);

    console.log('Saving configuration for product:', productId);
    console.log('Configuration:', normalizedConfig);
    console.log('Discount:', discountConfig);
    console.log('Price breakdown:', priceBreakdown);

    // Prepare discount for saving - preserve original discount object with discount_id and applied_rule
    // but also include the calculated discount_amount for display
    let discountToSave = null;
    if (config.discount && config.discount.enabled) {
      discountToSave = {
        ...config.discount, // Preserve original fields (discount_id, applied_rule, discount_title, etc.)
        enabled: true,
        discount_amount: priceBreakdown.discount?.discountAmount || 0 // Add calculated discount amount
      };
    }

    // Add calculated values to config for metafields
    const configWithCalculations = {
      ...normalizedConfig,
      metalRate: priceBreakdown.metalRate || 0,
      metalCost: priceBreakdown.metalCost || 0,
      makingCharge: priceBreakdown.makingCharge || 0,
      labourCharge: priceBreakdown.labourCharge || 0,
      wastageCharge: priceBreakdown.wastageCharge || 0,
      taxAmount: priceBreakdown.taxAmount || 0,
      subtotal: priceBreakdown.subtotal || 0,
      discountedSubtotal: priceBreakdown.discountedSubtotal || priceBreakdown.subtotal || 0,
      priceBeforeDiscount: priceBreakdown.priceBeforeDiscount || priceBreakdown.finalPrice || 0,
      taxAmountBeforeDiscount: priceBreakdown.taxAmountBeforeDiscount || priceBreakdown.taxAmount || 0,
      discount: discountToSave, // Save original discount with discount_id, not processed discountConfig
      productCode: config.productCode || productId.split('/').pop() // Use product ID as code if not provided
    };

    // Update metafields
    const result = await shopifyAPI.updateProductConfiguration(productId, configWithCalculations);
    
    console.log('Metafields saved successfully:', result.metafields?.length || 0, 'fields');

    // Get product variant ID to update price
    let priceUpdateSuccess = false;
    let priceUpdateError = null;
    try {
      const productConfig = await shopifyAPI.getProductConfiguration(productId);
      if (productConfig.variantId) {
        // Use final price after discount if discount is applied
        const finalPrice = priceBreakdown.finalPriceAfterDiscount || priceBreakdown.finalPrice;
        const roundedPrice = Math.ceil(finalPrice);
        await shopifyAPI.updateProductPrice(productId, productConfig.variantId, roundedPrice);
        console.log('Variant price updated successfully to:', roundedPrice);
        priceUpdateSuccess = true;
      } else {
        console.warn('No variant found for product:', productId);
        priceUpdateError = 'No variant found for this product';
      }
    } catch (error) {
      console.error('Error updating variant price:', error);
      priceUpdateError = error.message;
      // Don't fail the entire request if price update fails - metafields are saved
    }

    const message = priceUpdateSuccess 
      ? 'Product configured and price updated successfully!'
      : priceUpdateError
        ? `Product configured successfully, but price update failed: ${priceUpdateError}. You can update it manually using "Refresh Prices".`
        : 'Product configured successfully. Click "Refresh Prices" in Dashboard to update product price in store.';

    res.json({
      success: true,
      message: message,
      data: {
        configuration: normalizedConfig,
        priceBreakdown,
        priceUpdated: priceUpdateSuccess
      }
    });
  } catch (error) {
    console.error('Error configuring product:', req.params.id, error);
    
    // Parse error message if it's a JSON string
    let errorMessage = error.message || 'Unknown error occurred';
    try {
      const parsed = JSON.parse(errorMessage);
      if (Array.isArray(parsed) && parsed.length > 0) {
        errorMessage = parsed.map(e => e.message || JSON.stringify(e)).join('; ');
      } else if (typeof parsed === 'object' && parsed.message) {
        errorMessage = parsed.message;
      }
    } catch {
      // Not JSON, use as is
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
}

/**
 * Calculate price without saving (for preview)
 */
export async function calculatePrice(req, res) {
  try {
    const { config: configParam, discount: discountParam, ...rest } = req.body;
    // Support both { config, discount } and flat structure
    const config = configParam || rest;
    const discountConfig = discountParam || null;
    
    const priceCalculator = getPriceCalculator();
    
    // If stones array is provided, calculate total stone cost
    let stoneCost = config.stoneCost || 0;
    if (config.stones && Array.isArray(config.stones)) {
      stoneCost = config.stones.reduce((sum, stone) => {
        const cost = parseFloat(stone.stoneCost) || 0;
        return sum + cost;
      }, 0);
    }
    
    // Create config for calculator with total stone cost
    const configForCalculator = {
      ...config,
      stoneCost: stoneCost
    };
    
    // Use discount from parameter, or try to extract from config if it has discount structure
    let finalDiscountConfig = discountConfig;
    
    // If discountConfig is provided and has discount_id, fetch full discount rules
    if (finalDiscountConfig && finalDiscountConfig.enabled && finalDiscountConfig.discount_id) {
      const shopifyAPI = getShopifyAPI();
      try {
        // Fetch the full discount rules from discount_id
        const discountRules = await shopifyAPI.getDiscountRuleById(finalDiscountConfig.discount_id);
        if (discountRules) {
          // Convert discount rules to discount config format based on applied_rule
          const appliedRule = finalDiscountConfig.applied_rule || 'gold';
          if (appliedRule === 'gold' && discountRules.gold_rules) {
            finalDiscountConfig = {
              enabled: true,
              goldRules: discountRules.gold_rules
            };
          } else if (appliedRule === 'diamond' && discountRules.diamond_rules) {
            finalDiscountConfig = {
              enabled: true,
              diamondRules: discountRules.diamond_rules
            };
          } else if (appliedRule === 'silver' && discountRules.silver_rules) {
            finalDiscountConfig = {
              enabled: true,
              silverRules: discountRules.silver_rules
            };
          }
        }
      } catch (error) {
        console.error('Error fetching discount rules:', error);
        // If fetching fails, we'll calculate without discount but still show stored discount_amount
      }
    }
    
    // Fallback: If no discountConfig but config has discount, use that
    if (!finalDiscountConfig && config.discount && config.discount.enabled) {
      // If discount is in config, check if it has discount_id (stored discount)
      if (config.discount.discount_id) {
        const shopifyAPI = getShopifyAPI();
        try {
          // Fetch the full discount rules from discount_id
          const discountRules = await shopifyAPI.getDiscountRuleById(config.discount.discount_id);
          if (discountRules) {
            // Convert discount rules to discount config format based on applied_rule
            const appliedRule = config.discount.applied_rule || 'gold';
            if (appliedRule === 'gold' && discountRules.gold_rules) {
              finalDiscountConfig = {
                enabled: true,
                goldRules: discountRules.gold_rules
              };
            } else if (appliedRule === 'diamond' && discountRules.diamond_rules) {
              finalDiscountConfig = {
                enabled: true,
                diamondRules: discountRules.diamond_rules
              };
            } else if (appliedRule === 'silver' && discountRules.silver_rules) {
              finalDiscountConfig = {
                enabled: true,
                silverRules: discountRules.silver_rules
              };
            }
          }
        } catch (error) {
          console.error('Error fetching discount rules:', error);
          // If fetching fails, we'll calculate without discount but still show stored discount_amount
        }
      } else {
        // If no discount_id, use discount as-is (might be a direct discount config)
        finalDiscountConfig = config.discount;
      }
    }
    
    // Fetch stone pricing for accurate product type detection
    const shopifyAPI = getShopifyAPI();
    const stonePricing = await shopifyAPI.getAllStonePricing();
    
    const priceBreakdown = priceCalculator.calculatePrice(configForCalculator, finalDiscountConfig, stonePricing);
    
    // If we have stored discount_amount but couldn't recalculate, use stored amount for display
    // Check both discountConfig and config.discount for stored discount info
    const storedDiscount = discountConfig || config.discount;
    
    if (storedDiscount && storedDiscount.discount_amount && !priceBreakdown.discount) {
      const discountAmount = parseFloat(storedDiscount.discount_amount) || 0;
      
      priceBreakdown.discount = {
        discountAmount: discountAmount,
        discountTitle: storedDiscount.discount_title || 'Discount',
        discountType: 'stored',
        discountAppliedOn: storedDiscount.applied_rule || 'unknown'
      };
      
      // Get tax percent from config or calculate from existing taxAmount and subtotal
      const taxPercent = parseFloat(configForCalculator.taxPercent) || 
                        (priceBreakdown.subtotal > 0 ? (priceBreakdown.taxAmount / priceBreakdown.subtotal) * 100 : 0);
      
      // Calculate tax on original subtotal (before discount) for "Price Before Discount" display
      const taxAmountBeforeDiscount = priceBreakdown.subtotal * (taxPercent / 100);
      const priceBeforeDiscount = priceBreakdown.subtotal + taxAmountBeforeDiscount;
      
      // Apply discount to subtotal before tax (correct calculation order)
      const discountedSubtotal = Math.max(0, priceBreakdown.subtotal - discountAmount);
      
      // Calculate tax on discounted subtotal
      const taxAmountOnDiscounted = discountedSubtotal * (taxPercent / 100);
      
      // Final price = discounted subtotal + tax
      priceBreakdown.taxAmountBeforeDiscount = Math.round(taxAmountBeforeDiscount * 100) / 100;
      priceBreakdown.priceBeforeDiscount = Math.round(priceBeforeDiscount * 100) / 100;
      priceBreakdown.discountedSubtotal = Math.round(discountedSubtotal * 100) / 100;
      priceBreakdown.taxAmount = Math.round(taxAmountOnDiscounted * 100) / 100;
      priceBreakdown.finalPriceAfterDiscount = Math.round((discountedSubtotal + taxAmountOnDiscounted) * 100) / 100;
    }

    res.json({
      success: true,
      data: priceBreakdown
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Search products
 */
export async function searchProducts(req, res) {
  try {
    const { query } = req.query;
    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const shopifyAPI = getShopifyAPI();
    // Build Shopify search query - search by title or vendor
    // Shopify GraphQL query parameter searches across title, vendor, and other fields
    // Format: "title:searchterm" or "vendor:searchterm" or just "searchterm" for general search
    const trimmedQuery = query.trim();
    const searchQuery = `title:${trimmedQuery} OR vendor:${trimmedQuery} OR ${trimmedQuery}`;
    const products = await shopifyAPI.searchProducts(searchQuery);
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Search products by SKU
 */
export async function searchBySku(req, res) {
  try {
    const { query } = req.query;
    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'SKU search query is required'
      });
    }

    const shopifyAPI = getShopifyAPI();
    const products = await shopifyAPI.searchProductsBySku(query.trim());
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Validate bulk SKUs
 */
export async function validateBulkSkus(req, res) {
  try {
    const { skus } = req.body;
    
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'SKUs array is required'
      });
    }

    const shopifyAPI = getShopifyAPI();
    
    // Find products for each SKU
    const results = await Promise.all(
      skus.map(async (sku) => {
        const trimmedSku = sku.trim();
        if (!trimmedSku) return { sku: trimmedSku, product: null };
        
        const product = await shopifyAPI.findProductBySku(trimmedSku);
        return { sku: trimmedSku, product };
      })
    );

    const valid = results.filter(r => r.product !== null).map(r => r.product);
    const invalid = results.filter(r => r.product === null).map(r => r.sku);

    res.json({
      success: true,
      data: {
        valid,
        invalid,
        total: skus.length,
        validCount: valid.length,
        invalidCount: invalid.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

