import { getPriceCalculator, getShopifyAPI } from '../middleware/calculatorInit.js';

/**
 * Get all configured products
 */
export async function getProducts(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const products = await shopifyAPI.getConfiguredProducts();
    
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

    // Normalize all numeric fields to default to 0 if empty
    const normalizedConfig = {
      metalWeight: normalizeNumeric(config.metalWeight),
      metalType: config.metalType || 'gold22kt',
      makingChargePercent: normalizeNumeric(config.makingChargePercent),
      labourType: config.labourType || 'percentage',
      labourValue: normalizeNumeric(config.labourValue),
      wastageType: config.wastageType || 'percentage',
      wastageValue: normalizeNumeric(config.wastageValue),
      stoneType: config.stoneType || 'none',
      stoneWeight: normalizeNumeric(config.stoneWeight),
      stoneCost: normalizeNumeric(config.stoneCost),
      netWeight: normalizeNumeric(config.netWeight),
      grossWeight: normalizeNumeric(config.grossWeight),
      taxPercent: normalizeNumeric(config.taxPercent) || 3 // Default tax to 3% if not provided
    };

    // Calculate price with current rates
    const priceBreakdown = priceCalculator.calculatePrice(normalizedConfig);

    console.log('Saving configuration for product:', productId);
    console.log('Configuration:', normalizedConfig);
    console.log('Price breakdown:', priceBreakdown);

    // Add calculated values to config for metafields
    const configWithCalculations = {
      ...normalizedConfig,
      metalRate: priceBreakdown.metalRate || 0,
      metalCost: priceBreakdown.metalCost || 0,
      makingCharge: priceBreakdown.makingCharge || 0,
      labourCharge: priceBreakdown.labourCharge || 0,
      wastageCharge: priceBreakdown.wastageCharge || 0,
      taxAmount: priceBreakdown.taxAmount || 0,
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
        await shopifyAPI.updateProductPrice(productId, productConfig.variantId, priceBreakdown.finalPrice);
        console.log('Variant price updated successfully to:', priceBreakdown.finalPrice);
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
    const config = req.body;
    const priceCalculator = getPriceCalculator();
    const priceBreakdown = priceCalculator.calculatePrice(config);

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

