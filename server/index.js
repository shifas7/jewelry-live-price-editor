import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PriceCalculator, StoneCalculator } from './utils/priceCalculator.js';
import ShopifyAPI from './utils/shopifyAPI.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Initialize Shopify API
const shopifyAPI = new ShopifyAPI(
  process.env.SHOP_NAME,
  process.env.SHOPIFY_ACCESS_TOKEN
);

// Global calculator instances (will be initialized with metal rates)
let priceCalculator;
let stoneCalculator;

// Initialize calculators with current rates
async function initializeCalculators() {
  try {
    const metalRates = await shopifyAPI.getMetalPrices();
    if (metalRates) {
      priceCalculator = new PriceCalculator(metalRates);
      console.log('✅ Price calculator initialized with current metal rates');
    } else {
      // Default rates if not set
      priceCalculator = new PriceCalculator({
        gold24kt: 7000,
        gold22kt: 6500,
        gold18kt: 5500,
        gold14kt: 4500,
        platinum: 3000,
        silver: 80
      });
      console.log('⚠️  Price calculator initialized with default rates');
    }

    // Initialize stone calculator
    const stonePrices = await shopifyAPI.getAllStonePricing();
    stoneCalculator = new StoneCalculator(stonePrices);
    console.log('✅ Stone calculator initialized');
  } catch (error) {
    console.error('❌ Error initializing calculators:', error);
  }
}

// ==================== METAL PRICES ENDPOINTS ====================

/**
 * GET /api/metal-prices
 * Get current metal prices
 */
app.get('/api/metal-prices', async (req, res) => {
  try {
    const prices = await shopifyAPI.getMetalPrices();
    res.json({
      success: true,
      data: prices || priceCalculator.getMetalRates()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/metal-prices
 * Update metal prices
 */
app.post('/api/metal-prices', async (req, res) => {
  try {
    const { gold24kt, gold22kt, gold18kt, gold14kt, platinum, silver } = req.body;

    // Validate input
    if (!gold24kt || !gold22kt || !gold18kt || !gold14kt || !platinum || !silver) {
      return res.status(400).json({
        success: false,
        error: 'All metal prices are required'
      });
    }

    // Update in Shopify
    const result = await shopifyAPI.updateMetalPrices({
      gold24kt: parseFloat(gold24kt),
      gold22kt: parseFloat(gold22kt),
      gold18kt: parseFloat(gold18kt),
      gold14kt: parseFloat(gold14kt),
      platinum: parseFloat(platinum),
      silver: parseFloat(silver)
    });

    // Update calculator
    priceCalculator.updateMetalRates({
      gold24kt: parseFloat(gold24kt),
      gold22kt: parseFloat(gold22kt),
      gold18kt: parseFloat(gold18kt),
      gold14kt: parseFloat(gold14kt),
      platinum: parseFloat(platinum),
      silver: parseFloat(silver)
    });

    res.json({
      success: true,
      message: 'Metal prices updated successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/refresh-prices
 * Bulk update all product prices based on current metal rates
 */
app.post('/api/refresh-prices', async (req, res) => {
  try {
    const currentRates = priceCalculator.getMetalRates();
    const updates = await shopifyAPI.bulkUpdatePrices(currentRates, priceCalculator);

    const successCount = updates.filter(u => u.success).length;
    const failCount = updates.filter(u => !u.success).length;

    res.json({
      success: true,
      message: `Updated ${successCount} products successfully. ${failCount} failed.`,
      data: {
        totalProducts: updates.length,
        successCount,
        failCount,
        updates
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== STONE PRICES ENDPOINTS ====================

/**
 * GET /api/stone-prices
 * Get all stone pricing configurations
 */
app.get('/api/stone-prices', async (req, res) => {
  try {
    const stones = await shopifyAPI.getAllStonePricing();
    res.json({
      success: true,
      data: stones
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/stone-prices
 * Create or update stone pricing
 */
app.post('/api/stone-prices', async (req, res) => {
  try {
    const stoneData = req.body;

    // Validate required fields
    if (!stoneData.stoneId || !stoneData.stoneType) {
      return res.status(400).json({
        success: false,
        error: 'Stone ID and type are required'
      });
    }

    let result;
    
    // If stone has an id (from Shopify metaobject), update it
    // Otherwise create new
    if (stoneData.id) {
      result = await shopifyAPI.updateStonePricing(stoneData.id, stoneData);
    } else {
      result = await shopifyAPI.createStonePricing(stoneData);
    }

    res.json({
      success: true,
      message: stoneData.id ? 'Stone pricing updated successfully' : 'Stone pricing created successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/stone-prices/:id
 * Delete stone pricing
 */
app.delete('/api/stone-prices/:id(*)', async (req, res) => {
  try {
    const stoneId = req.params.id;

    const mutation = `
      mutation DeleteStonePricing($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const result = await shopifyAPI.graphql(mutation, { id: stoneId });

    if (result.metaobjectDelete?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.metaobjectDelete.userErrors));
    }

    res.json({
      success: true,
      message: 'Stone pricing deleted successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== PRODUCT CONFIGURATION ENDPOINTS ====================

/**
 * GET /api/products
 * Get all configured products
 */
app.get('/api/products', async (req, res) => {
  try {
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
});

/**
 * GET /api/products/:id
 * Get specific product configuration
 */
app.get('/api/products/:id(*)', async (req, res) => {
  try {
    const productId = req.params.id;
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
});

/**
 * POST /api/products/:id/configure
 * Configure product pricing parameters
 */
app.post('/api/products/:id(*)/configure', async (req, res) => {
  try {
    const productId = req.params.id;
    const config = req.body;

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
});

/**
 * POST /api/calculate-price
 * Calculate price without saving (for preview)
 */
app.post('/api/calculate-price', async (req, res) => {
  try {
    const config = req.body;
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
});

// ==================== UTILITY ENDPOINTS ====================

/**
 * GET /
 * Redirect to admin interface
 */
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Jewelry Price App is running',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/run-setup
 * Run Shopify setup to create metafield definitions
 */
app.post('/api/run-setup', async (req, res) => {
  try {
    console.log('Running Shopify setup...');
    
    const setupLogs = [];
    
    // Create metafield definitions
    const metafields = [
      'metal_weight',
      'metal_type', 
      'making_charge_percent',
      'labour_type',
      'labour_value',
      'wastage_type',
      'wastage_value',
      'stone_cost',
      'tax_percent',
      'configured'
    ];

    for (const field of metafields) {
      try {
        const mutation = `
          mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition {
                id
                name
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const fieldType = ['metal_type', 'labour_type', 'wastage_type'].includes(field) 
          ? 'single_line_text_field' 
          : field === 'configured' 
            ? 'boolean' 
            : 'number_decimal';

        const definition = {
          name: field.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          namespace: 'jewelry_config',
          key: field,
          type: fieldType,
          ownerType: 'PRODUCT'
        };

        await shopifyAPI.graphql(mutation, { definition });
        setupLogs.push(`✅ Created metafield: ${field}`);
      } catch (error) {
        setupLogs.push(`⚠️  ${field} may already exist`);
      }
    }

    res.json({
      success: true,
      message: 'Setup completed! Metafield definitions created.',
      output: setupLogs.join('\n')
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/status
 * Get app status and configuration
 */
app.get('/api/status', async (req, res) => {
  try {
    const metalRates = priceCalculator.getMetalRates();
    const products = await shopifyAPI.getConfiguredProducts();

    res.json({
      success: true,
      data: {
        metalRates,
        configuredProducts: products.length,
        shopName: process.env.SHOP_NAME,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/setup
 * Run setup to create metafield definitions (one-time)
 */
app.post('/api/setup', async (req, res) => {
  try {
    console.log('Running setup via API endpoint...');
    
    // Import and run setup
    const { execSync } = await import('child_process');
    const output = execSync('node server/setup.js', { encoding: 'utf-8' });
    
    res.json({
      success: true,
      message: 'Setup completed successfully',
      output: output
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`\n🚀 Jewelry Price App Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health\n`);
  
  // Initialize calculators on startup
  await initializeCalculators();
});

export default app;