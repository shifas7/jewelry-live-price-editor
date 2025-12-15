import express from 'express';
import {
  getDiscounts,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  applyBulkDiscount,
  applyCollectionDiscount,
  getCollections,
  resolveConflict
} from '../controllers/discountsController.js';

const router = express.Router();

// Get all discount rules
router.get('/', getDiscounts);

// Create new discount rule
router.post('/', createDiscount);

// Apply discount to bulk products
router.post('/apply-bulk', applyBulkDiscount);

// Apply discount to collection
router.post('/apply-collection', applyCollectionDiscount);

// Get collections
router.get('/collections', getCollections);

// Resolve conflict
router.post('/resolve-conflict', resolveConflict);

// Update and Delete routes - use wildcard pattern to handle GIDs with slashes
// The wildcard (*) matches everything, and we extract it from req.params[0]
// These must come after all specific routes to avoid conflicts
router.put('*', updateDiscount);
router.delete('*', deleteDiscount);

export default router;

