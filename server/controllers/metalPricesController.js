import { getPriceCalculator, getShopifyAPI, updatePriceCalculatorRates } from '../middleware/calculatorInit.js';

/**
 * Get current metal prices
 */
export async function getMetalPrices(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const priceCalculator = getPriceCalculator();
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
}

/**
 * Update metal prices
 */
export async function updateMetalPrices(req, res) {
  try {
    const { gold24kt, gold22kt, gold18kt, gold14kt, platinum, silver } = req.body;

    // Validate input
    if (!gold24kt || !gold22kt || !gold18kt || !gold14kt || !platinum || !silver) {
      return res.status(400).json({
        success: false,
        error: 'All metal prices are required'
      });
    }

    const shopifyAPI = getShopifyAPI();
    const priceCalculator = getPriceCalculator();

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
    updatePriceCalculatorRates({
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
}

/**
 * Bulk update all product prices based on current metal rates
 */
export async function refreshPrices(req, res) {
  try {
    const priceCalculator = getPriceCalculator();
    const shopifyAPI = getShopifyAPI();
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
}

