import express from 'express';
import * as productsController from '../controllers/productsController.js';

const router = express.Router();

/**
 * GET /api/products
 * Get all configured products
 */
router.get('/', productsController.getProducts);

/**
 * GET /api/products/search?query=...
 * Search products
 * NOTE: This must come before /:id(*) route to avoid matching "search" as an ID
 */
router.get('/search', productsController.searchProducts);

/**
 * GET /api/products/:id
 * Get specific product configuration
 */
router.get('/:id(*)', productsController.getProductConfiguration);

/**
 * POST /api/products/:id/configure
 * Configure product pricing parameters
 */
router.post('/:id(*)/configure', productsController.configureProduct);

export default router;

