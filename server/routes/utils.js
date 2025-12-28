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
 * Returns job ID immediately, processes in background
 */
router.post('/refresh-prices', metalPricesController.refreshPrices);

/**
 * GET /api/refresh-prices/status/:jobId
 * Get status of a refresh prices job
 */
router.get('/refresh-prices/status/:jobId', metalPricesController.getRefreshStatus);

/**
 * POST /api/refresh-prices/cancel/:jobId
 * Cancel a refresh prices job
 */
router.post('/refresh-prices/cancel/:jobId', metalPricesController.cancelRefresh);

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

