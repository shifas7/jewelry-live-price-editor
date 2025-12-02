import express from 'express';
import * as stonePricesController from '../controllers/stonePricesController.js';

const router = express.Router();

/**
 * GET /api/stone-prices
 * Get all stone pricing configurations
 */
router.get('/', stonePricesController.getStonePrices);

/**
 * POST /api/stone-prices
 * Create or update stone pricing
 */
router.post('/', stonePricesController.createOrUpdateStonePricing);

/**
 * DELETE /api/stone-prices/:id
 * Delete stone pricing
 */
router.delete('/:id(*)', stonePricesController.deleteStonePricing);

export default router;

