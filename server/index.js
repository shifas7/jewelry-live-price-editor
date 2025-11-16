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

    const result = await shopifyAPI.createStonePricing(stoneData);

    res.json({
      success: true,
      message: 'Stone pricing created/updated successfully',
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

    // Validate configuration
    const requiredFields = [
      'metalWeight', 'metalType', 'makingChargePercent',
      'labourType', 'labourValue', 'wastageType', 'wastageValue',
      'stoneCost', 'taxPercent'
    ];

    const missingFields = requiredFields.filter(field => config[field] === undefined);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Calculate price with current rates
    const priceBreakdown = priceCalculator.calculatePrice(config);

    console.log('Saving configuration for product:', productId);
    console.log('Configuration:', config);

    // Update metafields
    const result = await shopifyAPI.updateProductConfiguration(productId, config);
    
    console.log('Metafields saved successfully:', result.metafields?.length || 0, 'fields');

    // Note: Price will be updated when "Refresh Prices" is clicked
    // This avoids complexity with variant price updates

    res.json({
      success: true,
      message: 'Product configured successfully. Click "Refresh Prices" in Dashboard to update product price in store.',
      data: {
        configuration: config,
        priceBreakdown
      }
    });
  } catch (error) {
    console.error('Error configuring product:', req.params.id, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred'
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