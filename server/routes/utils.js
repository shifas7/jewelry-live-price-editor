import express from 'express';
import * as utilsController from '../controllers/utilsController.js';
import * as metalPricesController from '../controllers/metalPricesController.js';
import * as productsController from '../controllers/productsController.js';

const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', utilsController.healthCheck);

/**
 * GET /api/status
 * Get app status and configuration
 */
router.get('/status', utilsController.getStatus);

/**
 * POST /api/refresh-prices
 * Bulk update all product prices based on current metal rates
 */
router.post('/refresh-prices', metalPricesController.refreshPrices);

/**
 * POST /api/calculate-price
 * Calculate price without saving (for preview)
 */
router.post('/calculate-price', productsController.calculatePrice);

/**
 * POST /api/run-setup
 * Run Shopify setup to create metafield definitions
 */
router.post('/run-setup', utilsController.runSetup);

/**
 * POST /api/setup
 * Run setup to create metafield definitions (one-time)
 */
router.post('/setup', utilsController.runSetupScript);

export default router;

