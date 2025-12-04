import express from 'express';
import * as metalPricesController from '../controllers/metalPricesController.js';

const router = express.Router();

/**
 * GET /api/metal-prices
 * Get current metal prices
 */
router.get('/', metalPricesController.getMetalPrices);

/**
 * POST /api/metal-prices
 * Update metal prices
 */
router.post('/', metalPricesController.updateMetalPrices);

export default router;

