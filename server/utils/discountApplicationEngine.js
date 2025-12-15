/**
 * Discount Application Engine
 * Handles automatic discount application, conflict detection, and collection syncing
 */

import { getPriceCalculator, getShopifyAPI } from '../middleware/calculatorInit.js';
import { DiscountCalculator } from './discountCalculator.js';

const discountCalculator = new DiscountCalculator();

export class DiscountApplicationEngine {
  constructor() {
    this.shopifyAPI = null;
    this.priceCalculator = null;
    this.stonePricingCache = null;
    this.stonePricingCacheTime = null;
    this.stonePricingCacheExpiry = 5 * 60 * 1000; // 5 minutes in milliseconds
  }

  /**
   * Initialize with Shopify API and Price Calculator
   */
  init() {
    if (!this.shopifyAPI || !this.priceCalculator) {
      this.shopifyAPI = getShopifyAPI();
      this.priceCalculator = getPriceCalculator();
    }
  }

  /**
   * Get stone pricing data (cached)
   * @returns {Promise<Array>} - Array of stone pricing objects
   */
  async getStonePricing() {
    // Check if cache is valid
    const now = Date.now();
    if (this.stonePricingCache && this.stonePricingCacheTime && 
        (now - this.stonePricingCacheTime) < this.stonePricingCacheExpiry) {
      return this.stonePricingCache;
    }

    // Fetch fresh data
    if (!this.shopifyAPI) {
      this.init();
    }

    try {
      const stonePricing = await this.shopifyAPI.getAllStonePricing();
      this.stonePricingCache = stonePricing;
      this.stonePricingCacheTime = now;
      return stonePricing;
    } catch (error) {
      console.error('Error fetching stone pricing:', error);
      // Return cached data if available, even if expired
      if (this.stonePricingCache) {
        return this.stonePricingCache;
      }
      return [];
    }
  }

  /**
   * Clear stone pricing cache
   */
  clearStonePricingCache() {
    this.stonePricingCache = null;
    this.stonePricingCacheTime = null;
  }

  /**
   * Get target product IDs based on application type
   * @param {Object} discount - Discount configuration
   * @returns {Promise<string[]>} - Array of product IDs
   */
  async getTargetProductIds(discount) {
    if (discount.application_type === 'collection') {
      const { products } = await this.shopifyAPI.getCollectionProducts(
        discount.target_collection_id,
        250 // Max products per collection
      );
      return products.map(p => p.id);
    } else if (discount.application_type === 'products') {
      return discount.target_product_ids || [];
    }
    return [];
  }

  /**
   * Detect conflicts - products that already have discounts
   * @param {string[]} productIds - Product IDs to check
   * @param {Object} newDiscount - New discount being applied
   * @returns {Promise<Array>} - Array of conflict objects
   */
  async detectConflicts(productIds, newDiscount) {
    const conflicts = [];

    for (const productId of productIds) {
      try {
        const config = await this.shopifyAPI.getProductConfiguration(productId);
        
        if (!config.configured) {
          continue; // Skip unconfigured products
        }

        // Check if product has existing discount
        const existingDiscount = config.discount;
        
        if (existingDiscount && existingDiscount.enabled) {
          // Conflict detected
          const product = await this.shopifyAPI.getProduct(productId);
          
          conflicts.push({
            productId,
            productTitle: product?.title || 'Unknown Product',
            productSku: product?.sku || 'N/A',
            existingDiscount: {
              discountId: existingDiscount.discount_id,
              discountTitle: existingDiscount.discount_title || 'Unknown Discount',
              discountAmount: existingDiscount.discount_amount || 0,
              appliedRule: existingDiscount.applied_rule
            },
            newDiscount: {
              discountId: newDiscount.id,
              discountTitle: newDiscount.discount_title,
              productType: await this.detectProductTypeForProduct(config)
            }
          });
        }
      } catch (error) {
        console.error(`Error checking conflict for product ${productId}:`, error);
        // Continue checking other products
      }
    }

    return conflicts;
  }

  /**
   * Detect product type for a configured product
   * @param {Object} config - Product configuration
   * @returns {Promise<string>} - Product type
   */
  async detectProductTypeForProduct(config) {
    const stones = config.stones || [];
    
    // If product has stones, check if any are diamonds by looking up stone pricing
    if (stones.length > 0) {
      try {
        const stonePricing = await this.getStonePricing();
        
        // Create a map of stone_id to stone_type for quick lookup
        const stoneTypeMap = {};
        stonePricing.forEach(stone => {
          if (stone.stone_id && stone.stone_type) {
            stoneTypeMap[stone.stone_id] = stone.stone_type;
          }
        });
        
        // Check if any stone is a diamond
        const hasDiamond = stones.some(stone => {
          const stoneId = stone.stoneType; // stone.stoneType contains the stone_id
          const actualStoneType = stoneTypeMap[stoneId];
          return actualStoneType && actualStoneType.toLowerCase() === 'diamond';
        });
        
        if (hasDiamond) {
          return 'diamond';
        }
      } catch (error) {
        console.error('Error detecting product type from stone pricing:', error);
        // Fallback to checking stoneType field directly (may not work correctly)
        const hasDiamond = stones.some(stone => {
          const stoneType = stone.stoneType?.toLowerCase() || '';
          return stoneType.includes('diamond');
        });
        if (hasDiamond) return 'diamond';
      }
    }

    // Check if metal type is silver
    if (config.metal_type?.toLowerCase().includes('silver')) {
      return 'silver';
    }
    
    // Default to gold
    return 'gold';
  }

  /**
   * Normalize product configuration for price calculation
   * Converts snake_case fields to camelCase and calculates stoneCost
   * @param {Object} config - Product configuration from getProductConfiguration()
   * @returns {Object} - Normalized config for PriceCalculator
   */
  normalizeConfigForPriceCalculation(config) {
    // Helper to parse numeric values
    const parseNum = (value) => {
      if (value === null || value === undefined || value === '' || isNaN(value)) {
        return 0;
      }
      return parseFloat(value) || 0;
    };

    // Calculate stoneCost from stones array or use stone_cost field
    let stoneCost = 0;
    if (config.stones && Array.isArray(config.stones) && config.stones.length > 0) {
      // Sum all stoneCost values from the stones array
      stoneCost = config.stones.reduce((sum, stone) => {
        return sum + parseNum(stone.stoneCost);
      }, 0);
    } else if (config.stone_cost !== undefined) {
      stoneCost = parseNum(config.stone_cost);
    }

    // Normalize stones array - ensure it's an array
    let stones = [];
    if (config.stones && Array.isArray(config.stones)) {
      stones = config.stones;
    }

    // Build normalized config with camelCase fields
    const normalized = {
      metalWeight: parseNum(config.metal_weight),
      metalType: config.metal_type || 'gold22kt',
      makingChargePercent: parseNum(config.making_charge_percent),
      labourType: config.labour_type || 'percentage',
      labourValue: parseNum(config.labour_value),
      wastageType: config.wastage_type || 'percentage',
      wastageValue: parseNum(config.wastage_value),
      stoneCost: stoneCost,
      stones: stones,
      taxPercent: parseNum(config.tax_percent) || 3
    };

    return normalized;
  }

  /**
   * Apply discount to a single product
   * @param {string} productId - Product ID
   * @param {Object} discount - Discount configuration
   * @returns {Promise<Object>} - Application result
   */
  async applyToProduct(productId, discount) {
    try {
      // Get product configuration
      const config = await this.shopifyAPI.getProductConfiguration(productId);
      
      if (!config.configured) {
        return {
          productId,
          success: false,
          error: 'Product not configured'
        };
      }

      // Normalize config for price calculation (convert snake_case to camelCase, calculate stoneCost)
      const normalizedConfig = this.normalizeConfigForPriceCalculation(config);
      
      // Validate normalized config has required fields
      if (!normalizedConfig.metalWeight || normalizedConfig.metalWeight <= 0) {
        return {
          productId,
          success: false,
          error: 'Product metal weight is missing or invalid'
        };
      }
      
      if (!normalizedConfig.metalType) {
        return {
          productId,
          success: false,
          error: 'Product metal type is missing'
        };
      }

      // Detect product type
      const productType = await this.detectProductTypeForProduct(config);
      
      // Build discount config for this product type
      let discountConfig = null;
      
      if (productType === 'gold' && discount.gold_rules?.enabled) {
        discountConfig = {
          enabled: true,
          goldRules: discount.gold_rules
        };
      } else if (productType === 'diamond' && discount.diamond_rules?.enabled) {
        discountConfig = {
          enabled: true,
          diamondRules: discount.diamond_rules
        };
      } else if (productType === 'silver' && discount.silver_rules?.enabled) {
        discountConfig = {
          enabled: true,
          silverRules: discount.silver_rules
        };
      } else {
        return {
          productId,
          success: false,
          error: `No matching discount rule for product type: ${productType}`
        };
      }

      // Fetch stone pricing for accurate product type detection
      const stonePricing = await this.getStonePricing();
      
      // Calculate price with discount using normalized config
      const priceBreakdown = this.priceCalculator.calculatePrice(normalizedConfig, discountConfig, stonePricing);
      
      // Validate price breakdown
      if (!priceBreakdown || !priceBreakdown.finalPrice || priceBreakdown.finalPrice <= 0) {
        console.error(`Invalid price breakdown for product ${productId}:`, priceBreakdown);
        return {
          productId,
          success: false,
          error: 'Price calculation resulted in invalid price'
        };
      }
      
      // Get discount result
      const discountResult = priceBreakdown.discount || {};
      
      // Validate discount amount is not negative
      const discountAmount = Math.max(0, discountResult.discountAmount || 0);
      
      // Calculate final price after discount
      let finalPrice = priceBreakdown.finalPriceAfterDiscount || priceBreakdown.finalPrice;
      
      // Ensure final price is not negative (discount cannot exceed base price)
      finalPrice = Math.max(0, finalPrice);
      
      // Validate final price is valid
      if (!finalPrice || finalPrice <= 0) {
        console.error(`Invalid final price for product ${productId}:`, {
          basePrice: priceBreakdown.finalPrice,
          discountAmount: discountAmount,
          finalPriceAfterDiscount: priceBreakdown.finalPriceAfterDiscount,
          finalPrice: finalPrice
        });
        return {
          productId,
          success: false,
          error: 'Final price after discount is invalid or zero'
        };
      }
      
      // Round up to nearest integer
      const roundedPrice = Math.ceil(finalPrice);
      
      // Update product discount metafield
      const discountMetafield = {
        enabled: true,
        discount_id: discount.id,
        discount_title: discount.discount_title,
        applied_rule: productType,
        discount_amount: discountAmount,
        applied_at: new Date().toISOString()
      };

      await this.shopifyAPI.updateProductDiscount(productId, discountMetafield);

      // Update product price
      if (config.variantId) {
        await this.shopifyAPI.updateProductPrice(productId, config.variantId, roundedPrice);
      } else {
        console.warn(`Product ${productId} has no variant ID, cannot update price`);
      }

      return {
        productId,
        success: true,
        newPrice: roundedPrice,
        discountAmount: discountResult.discountAmount || 0,
        productType
      };
    } catch (error) {
      console.error(`Error applying discount to product ${productId}:`, error);
      return {
        productId,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Apply discount to all target products
   * @param {Object} discount - Discount configuration
   * @returns {Promise<Object>} - Application results
   */
  async applyDiscountToTargets(discount) {
    if (!this.shopifyAPI) {
      this.init();
    }

    // Get target product IDs
    const productIds = await this.getTargetProductIds(discount);
    
    if (productIds.length === 0) {
      return {
        success: false,
        error: 'No target products found'
      };
    }

    // Detect conflicts
    const conflicts = await this.detectConflicts(productIds, discount);
    
    if (conflicts.length > 0) {
      return {
        hasConflicts: true,
        conflicts,
        pendingDiscount: discount,
        totalProducts: productIds.length,
        conflictCount: conflicts.length
      };
    }

    // Apply to all products
    const results = await Promise.all(
      productIds.map(id => this.applyToProduct(id, discount))
    );

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return {
      success: true,
      applied: successCount,
      failed: failCount,
      totalProducts: productIds.length,
      results
    };
  }

  /**
   * Resolve conflict for a product
   * @param {string} productId - Product ID
   * @param {Object} discount - New discount
   * @param {string} action - 'replace' | 'keep_existing' | 'skip'
   * @returns {Promise<Object>} - Resolution result
   */
  async resolveConflict(productId, discount, action) {
    if (action === 'replace') {
      // Remove existing discount first
      await this.shopifyAPI.updateProductDiscount(productId, { enabled: false });
      
      // Apply new discount
      return await this.applyToProduct(productId, discount);
    } else if (action === 'keep_existing') {
      return {
        productId,
        success: true,
        skipped: true,
        message: 'Existing discount kept'
      };
    } else if (action === 'skip') {
      return {
        productId,
        success: true,
        skipped: true,
        message: 'Product skipped'
      };
    }

    return {
      productId,
      success: false,
      error: 'Invalid action'
    };
  }

  /**
   * Remove discount from products
   * @param {string[]} productIds - Product IDs
   * @returns {Promise<Object>} - Removal results
   */
  async removeDiscountFromProducts(productIds) {
    if (!this.shopifyAPI) {
      this.init();
    }

    const results = [];

    for (const productId of productIds) {
      try {
        // Remove discount metafield
        await this.shopifyAPI.updateProductDiscount(productId, { enabled: false });
        
        // Recalculate price without discount
        const config = await this.shopifyAPI.getProductConfiguration(productId);
        if (config.configured && config.variantId) {
          // Normalize config before calculating price
          const normalizedConfig = this.normalizeConfigForPriceCalculation(config);
          
          // Fetch stone pricing for accurate product type detection (even though no discount)
          const stonePricing = await this.getStonePricing();
          const priceBreakdown = this.priceCalculator.calculatePrice(normalizedConfig, null, stonePricing);
          
          // Validate price breakdown
          if (priceBreakdown && priceBreakdown.finalPrice && priceBreakdown.finalPrice > 0) {
            const roundedPrice = Math.ceil(priceBreakdown.finalPrice);
            await this.shopifyAPI.updateProductPrice(productId, config.variantId, roundedPrice);
          } else {
            console.error(`Invalid price breakdown when removing discount from product ${productId}:`, priceBreakdown);
          }
        }

        results.push({ productId, success: true });
      } catch (error) {
        results.push({ productId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Sync collection discounts when products are added/removed
   * @param {string} collectionId - Collection ID
   * @returns {Promise<Object>} - Sync results
   */
  async syncCollectionDiscounts(collectionId) {
    if (!this.shopifyAPI) {
      this.init();
    }

    // Find all active discounts targeting this collection
    const allDiscounts = await this.shopifyAPI.getDiscountRules();
    const collectionDiscounts = allDiscounts.filter(
      d => d.application_type === 'collection' && 
           d.target_collection_id === collectionId && 
           d.is_active
    );

    if (collectionDiscounts.length === 0) {
      return { synced: 0, message: 'No active discounts for this collection' };
    }

    // Get current products in collection
    const { products } = await this.shopifyAPI.getCollectionProducts(collectionId, 250);
    const currentProductIds = products.map(p => p.id);

    // For each discount, sync products
    const syncResults = [];

    for (const discount of collectionDiscounts) {
      // Get products that should have this discount
      const targetIds = await this.getTargetProductIds(discount);
      
      // Find products that need discount applied (new products)
      const newProducts = targetIds.filter(id => !currentProductIds.includes(id));
      
      // Find products that need discount removed (removed from collection)
      const removedProducts = currentProductIds.filter(id => !targetIds.includes(id));

      // Apply to new products
      for (const productId of newProducts) {
        const result = await this.applyToProduct(productId, discount);
        syncResults.push({ productId, action: 'applied', result });
      }

      // Remove from removed products
      for (const productId of removedProducts) {
        await this.removeDiscountFromProducts([productId]);
        syncResults.push({ productId, action: 'removed' });
      }
    }

    return {
      synced: syncResults.length,
      results: syncResults
    };
  }
}

export default DiscountApplicationEngine;

