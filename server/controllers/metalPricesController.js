import { getPriceCalculator, getShopifyAPI, updatePriceCalculatorRates } from '../middleware/calculatorInit.js';

/**
 * Format price with Indian Rupee symbol and /g suffix
 */
function formatPrice(price) {
  if (!price) return '';
  // Format number with Indian numbering system (lakhs, crores)
  const formatted = new Intl.NumberFormat('en-IN').format(price);
  return `₹${formatted}/g`;
}

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
 * Get formatted metal prices for Shopify theme display
 * Returns prices formatted with ₹ symbol and /g suffix
 */
export async function getFormattedMetalPrices(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const prices = await shopifyAPI.getMetalPrices();
    
    if (!prices) {
      const priceCalculator = getPriceCalculator();
      const fallbackPrices = priceCalculator.getMetalRates();
      
      if (!fallbackPrices) {
        return res.json({
          success: true,
          data: {
            formatted: [],
            raw: {}
          }
        });
      }
      
      // Use fallback prices - Order: Gold 24K, Gold 22K, Gold 18K, Gold 14K, Silver, Platinum
      const formattedPrices = [
        { label: 'Gold 24K', price: formatPrice(fallbackPrices.gold24kt), key: 'gold24kt' },
        { label: 'Gold 22K', price: formatPrice(fallbackPrices.gold22kt), key: 'gold22kt' },
        { label: 'Gold 18K', price: formatPrice(fallbackPrices.gold18kt), key: 'gold18kt' },
        { label: 'Gold 14K', price: formatPrice(fallbackPrices.gold14kt), key: 'gold14kt' },
        { label: 'Silver', price: formatPrice(fallbackPrices.silver), key: 'silver' },
        { label: 'Platinum', price: formatPrice(fallbackPrices.platinum), key: 'platinum' }
      ].filter(item => item.price);
      
      return res.json({
        success: true,
        data: {
          formatted: formattedPrices,
          raw: fallbackPrices
        }
      });
    }

    // Map to formatted display format
    // Prices from Shopify API have keys like gold22kt (no underscores)
    // Order: Gold 24K, Gold 22K, Gold 18K, Gold 14K, Silver, Platinum
    const formattedPrices = [
      { label: 'Gold 24K', price: formatPrice(prices.gold24kt), key: 'gold24kt' },
      { label: 'Gold 22K', price: formatPrice(prices.gold22kt), key: 'gold22kt' },
      { label: 'Gold 18K', price: formatPrice(prices.gold18kt), key: 'gold18kt' },
      { label: 'Gold 14K', price: formatPrice(prices.gold14kt), key: 'gold14kt' },
      { label: 'Silver', price: formatPrice(prices.silver), key: 'silver' },
      { label: 'Platinum', price: formatPrice(prices.platinum), key: 'platinum' }
    ].filter(item => item.price); // Remove empty prices
    
    res.json({
      success: true,
      data: {
        formatted: formattedPrices,
        raw: prices
      }
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

