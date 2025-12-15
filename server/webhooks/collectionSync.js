/**
 * Collection Sync Webhook Handlers
 * Handles automatic discount syncing when collections change
 */

import { DiscountApplicationEngine } from '../utils/discountApplicationEngine.js';

const applicationEngine = new DiscountApplicationEngine();

/**
 * Handle collection update webhook
 * Triggered when products are added/removed from a collection
 */
export async function handleCollectionUpdate(req, res) {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    // Initialize application engine
    applicationEngine.init();

    // Sync discounts for this collection
    const result = await applicationEngine.syncCollectionDiscounts(id);

    console.log(`Collection ${id} synced: ${result.synced} products updated`);

    res.status(200).json({
      success: true,
      synced: result.synced,
      message: `Synced ${result.synced} products`
    });
  } catch (error) {
    console.error('Error syncing collection:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle product delete webhook
 * Remove discount from deleted products
 */
export async function handleProductDelete(req, res) {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // Initialize application engine
    if (!applicationEngine.shopifyAPI) {
      applicationEngine.init();
    }

    // Remove discount from product (if it exists)
    await applicationEngine.removeDiscountFromProducts([id]);

    console.log(`Product ${id} deleted, discount removed`);

    res.status(200).json({
      success: true,
      message: 'Product discount removed'
    });
  } catch (error) {
    console.error('Error handling product delete:', error);
    // Don't fail webhook - product is already deleted
    res.status(200).json({
      success: true,
      message: 'Webhook processed'
    });
  }
}

/**
 * Verify webhook (Shopify requires this for webhook registration)
 */
export async function verifyWebhook(req, res) {
  // Shopify sends a GET request to verify the webhook endpoint
  // Return 200 OK to confirm endpoint exists
  res.status(200).send('OK');
}

