import { getPriceCalculator, getShopifyAPI } from '../middleware/calculatorInit.js';
import { DiscountCalculator } from '../utils/discountCalculator.js';
import { DiscountApplicationEngine } from '../utils/discountApplicationEngine.js';

const discountCalculator = new DiscountCalculator();
const applicationEngine = new DiscountApplicationEngine();

/**
 * Get all discount rules
 */
export async function getDiscounts(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const rules = await shopifyAPI.getDiscountRules();
    
    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Create new unified discount (with all 3 product types)
 * Auto-applies to targets on creation
 */
export async function createDiscount(req, res) {
  try {
    const {
      discount_title,
      application_type,
      target_collection_id,
      target_product_ids,
      gold_rules,
      diamond_rules,
      silver_rules,
      is_active = true
    } = req.body;
    
    // Validate all required fields
    if (!discount_title || !discount_title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Discount title is required'
      });
    }

    if (!application_type || !['collection', 'products'].includes(application_type)) {
      return res.status(400).json({
        success: false,
        error: 'Application type must be "collection" or "products"'
      });
    }

    if (application_type === 'collection' && !target_collection_id) {
      return res.status(400).json({
        success: false,
        error: 'Target collection ID is required for collection application'
      });
    }

    if (application_type === 'products' && (!target_product_ids || !Array.isArray(target_product_ids) || target_product_ids.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Target product IDs array is required for products application'
      });
    }

    // Validate all 3 product types are configured
    const validation = discountCalculator.validateUnifiedDiscountConfig({
      goldRules: gold_rules,
      diamondRules: diamond_rules,
      silverRules: silver_rules
    });
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.errors.join(', ')
      });
    }
    
    // Build discount data
    const discountData = {
      discount_title: discount_title.trim(),
      application_type,
      target_collection_id: application_type === 'collection' ? target_collection_id : null,
      target_product_ids: application_type === 'products' ? target_product_ids : [],
      gold_rules,
      diamond_rules,
      silver_rules,
      is_active,
      created_at: new Date().toISOString(),
      last_applied: null
    };
    
    const shopifyAPI = getShopifyAPI();
    const result = await shopifyAPI.createDiscount(discountData);
    
    console.log('Create discount result:', JSON.stringify(result, null, 2));
    
    if (result.metaobjectCreate?.userErrors && result.metaobjectCreate.userErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: result.metaobjectCreate.userErrors.map(e => e.message).join(', ')
      });
    }
    
    if (!result.metaobjectCreate?.metaobject) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create discount. Metaobject definition might not exist in Shopify.'
      });
    }

    const createdDiscount = {
      id: result.metaobjectCreate.metaobject.id,
      ...discountData
    };

    // Auto-apply discount to targets
    if (!applicationEngine.shopifyAPI) {
      applicationEngine.init();
    }
    const applyResult = await applicationEngine.applyDiscountToTargets(createdDiscount);
    
    // Update last_applied timestamp
    if (applyResult.success || applyResult.hasConflicts) {
      await shopifyAPI.updateDiscount(createdDiscount.id, {
        ...discountData,
        last_applied: new Date().toISOString()
      });
    }

    if (applyResult.hasConflicts) {
      return res.json({
        success: true,
        hasConflicts: true,
        message: 'Discount created but conflicts detected',
        conflicts: applyResult.conflicts,
        discount: createdDiscount,
        data: result.metaobjectCreate.metaobject
      });
    }
    
    res.json({
      success: true,
      message: `Discount created and applied to ${applyResult.applied} products`,
      applied: applyResult.applied,
      failed: applyResult.failed,
      data: result.metaobjectCreate.metaobject
    });
  } catch (error) {
    console.error('Error creating discount:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update unified discount
 * Re-applies to targets after update
 */
export async function updateDiscount(req, res) {
  try {
    // Extract ruleId from URL (handles GIDs with slashes via wildcard route)
    // Parse from req.originalUrl or req.url, removing base path and query string
    const urlPath = req.originalUrl || req.url;
    const basePath = '/api/discounts/';
    const index = urlPath.indexOf(basePath);
    if (index === -1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount rule ID in URL'
      });
    }
    let ruleId = urlPath.substring(index + basePath.length);
    // Remove query string if present
    const queryIndex = ruleId.indexOf('?');
    if (queryIndex !== -1) {
      ruleId = ruleId.substring(0, queryIndex);
    }
    // Decode URL-encoded characters
    ruleId = decodeURIComponent(ruleId);
    
    if (!ruleId) {
      return res.status(400).json({
        success: false,
        error: 'Discount rule ID is required'
      });
    }
    const {
      discount_title,
      application_type,
      target_collection_id,
      target_product_ids,
      gold_rules,
      diamond_rules,
      silver_rules,
      is_active
    } = req.body;
    
    // Get existing discount to compare targets
    const shopifyAPI = getShopifyAPI();
    const existingDiscount = await shopifyAPI.getDiscountRule(ruleId);
    
    if (!existingDiscount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }

    // Validate all 3 product types are configured
    const validation = discountCalculator.validateUnifiedDiscountConfig({
      goldRules: gold_rules,
      diamondRules: diamond_rules,
      silverRules: silver_rules
    });
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.errors.join(', ')
      });
    }

    // Build updated discount data
    const discountData = {
      discount_title: discount_title?.trim() || existingDiscount.discount_title,
      application_type: application_type || existingDiscount.application_type,
      target_collection_id: application_type === 'collection' ? target_collection_id : null,
      target_product_ids: application_type === 'products' ? target_product_ids : [],
      gold_rules: gold_rules || existingDiscount.gold_rules,
      diamond_rules: diamond_rules || existingDiscount.diamond_rules,
      silver_rules: silver_rules || existingDiscount.silver_rules,
      is_active: is_active !== undefined ? is_active : existingDiscount.is_active
    };
    
    // Update discount in Shopify
    const result = await shopifyAPI.updateDiscount(ruleId, discountData);
    
    if (result.metaobjectUpdate?.userErrors && result.metaobjectUpdate.userErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: result.metaobjectUpdate.userErrors.map(e => e.message).join(', ')
      });
    }

    const updatedDiscount = {
      id: ruleId,
      ...discountData
    };

    // Remove discount from old targets if targets changed
    const targetsChanged = 
      existingDiscount.application_type !== discountData.application_type ||
      (discountData.application_type === 'collection' && 
       existingDiscount.target_collection_id !== discountData.target_collection_id) ||
      (discountData.application_type === 'products' && 
       JSON.stringify(existingDiscount.target_product_ids) !== JSON.stringify(discountData.target_product_ids));

    if (targetsChanged) {
      applicationEngine.init();
      const oldProductIds = await applicationEngine.getTargetProductIds(existingDiscount);
      await applicationEngine.removeDiscountFromProducts(oldProductIds);
    }

    // Re-apply to new targets
    if (!applicationEngine.shopifyAPI) {
      applicationEngine.init();
    }
    const applyResult = await applicationEngine.applyDiscountToTargets(updatedDiscount);
    
    // Update last_applied timestamp
    if (applyResult.success || applyResult.hasConflicts) {
      await shopifyAPI.updateDiscount(ruleId, {
        ...discountData,
        last_applied: new Date().toISOString()
      });
    }

    if (applyResult.hasConflicts) {
      return res.json({
        success: true,
        hasConflicts: true,
        message: 'Discount updated but conflicts detected',
        conflicts: applyResult.conflicts,
        discount: updatedDiscount,
        data: result.metaobjectUpdate?.metaobject
      });
    }
    
    res.json({
      success: true,
      message: `Discount updated and re-applied to ${applyResult.applied} products`,
      applied: applyResult.applied,
      failed: applyResult.failed,
      data: result.metaobjectUpdate?.metaobject
    });
  } catch (error) {
    console.error('Error updating discount:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete discount rule
 */
export async function deleteDiscount(req, res) {
  try {
    // Extract ruleId from URL (handles GIDs with slashes via wildcard route)
    // Parse from req.originalUrl or req.url, removing base path and query string
    const urlPath = req.originalUrl || req.url;
    const basePath = '/api/discounts/';
    const index = urlPath.indexOf(basePath);
    if (index === -1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount rule ID in URL'
      });
    }
    let ruleId = urlPath.substring(index + basePath.length);
    // Remove query string if present
    const queryIndex = ruleId.indexOf('?');
    if (queryIndex !== -1) {
      ruleId = ruleId.substring(0, queryIndex);
    }
    // Decode URL-encoded characters
    ruleId = decodeURIComponent(ruleId);
    
    if (!ruleId) {
      return res.status(400).json({
        success: false,
        error: 'Discount rule ID is required'
      });
    }

    const shopifyAPI = getShopifyAPI();
    
    // Get the discount rule before deleting to find affected products
    const allDiscounts = await shopifyAPI.getDiscountRules();
    const discountToDelete = allDiscounts.find(d => d.id === ruleId);
    
    if (!discountToDelete) {
      return res.status(404).json({
        success: false,
        error: 'Discount rule not found'
      });
    }

    // Initialize application engine and remove discounts from all target products
    applicationEngine.init();
    
    try {
      // Get all product IDs that have this discount applied
      const targetProductIds = await applicationEngine.getTargetProductIds(discountToDelete);
      
      if (targetProductIds.length > 0) {
        // Remove discounts from all affected products and recalculate prices
        const removalResults = await applicationEngine.removeDiscountFromProducts(targetProductIds);
        
        const successCount = removalResults.filter(r => r.success).length;
        const failCount = removalResults.filter(r => !r.success).length;
        
        console.log(`Removed discount from ${successCount} products, ${failCount} failed`);
        
        // Log any failures for debugging
        if (failCount > 0) {
          const failures = removalResults.filter(r => !r.success);
          console.error('Failed to remove discount from products:', failures);
        }
      }
    } catch (removalError) {
      // Log error but continue with deletion - don't block deletion if removal fails
      console.error('Error removing discounts from products:', removalError);
      // Continue with rule deletion even if product removal had issues
    }
    
    // Delete the discount rule metaobject
    const result = await shopifyAPI.deleteDiscountRule(ruleId);
    
    if (result.metaobjectDelete?.userErrors && result.metaobjectDelete.userErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: result.metaobjectDelete.userErrors.map(e => e.message).join(', ')
      });
    }
    
    res.json({
      success: true,
      message: 'Discount rule deleted successfully and discounts removed from all target products'
    });
  } catch (error) {
    console.error('Error deleting discount:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Apply discount to bulk selected products
 */
export async function applyBulkDiscount(req, res) {
  try {
    const { productIds, discountConfig } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Product IDs array is required'
      });
    }
    
    if (!discountConfig) {
      return res.status(400).json({
        success: false,
        error: 'Discount configuration is required'
      });
    }
    
    const shopifyAPI = getShopifyAPI();
    const priceCalculator = getPriceCalculator();
    
    const results = await shopifyAPI.bulkApplyDiscount(productIds, discountConfig, priceCalculator);
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    res.json({
      success: true,
      message: `Applied discount to ${successCount} products. ${failCount} failed.`,
      data: {
        totalProducts: results.length,
        successCount,
        failCount,
        results
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
 * Apply discount to collection
 */
export async function applyCollectionDiscount(req, res) {
  try {
    const { collectionId, discountConfig } = req.body;
    
    if (!collectionId) {
      return res.status(400).json({
        success: false,
        error: 'Collection ID is required'
      });
    }
    
    if (!discountConfig) {
      return res.status(400).json({
        success: false,
        error: 'Discount configuration is required'
      });
    }
    
    const shopifyAPI = getShopifyAPI();
    const priceCalculator = getPriceCalculator();
    
    // Get all products in collection
    const { products } = await shopifyAPI.getCollectionProducts(collectionId, 250);
    const productIds = products.map(p => p.id);
    
    if (productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No products found in collection'
      });
    }
    
    // Apply discount to all products
    const results = await shopifyAPI.bulkApplyDiscount(productIds, discountConfig, priceCalculator);
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    res.json({
      success: true,
      message: `Applied discount to ${successCount} products in collection. ${failCount} failed.`,
      data: {
        totalProducts: results.length,
        successCount,
        failCount,
        results
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
 * Get collections
 */
export async function getCollections(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const result = await shopifyAPI.getCollections();
    
    res.json({
      success: true,
      data: result.collections,
      pageInfo: result.pageInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Resolve discount conflict
 */
export async function resolveConflict(req, res) {
  try {
    const { productId, discountId, action } = req.body;
    
    if (!productId || !discountId || !action) {
      return res.status(400).json({
        success: false,
        error: 'Product ID, discount ID, and action are required'
      });
    }

    if (!['replace', 'keep_existing', 'skip'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action must be: replace, keep_existing, or skip'
      });
    }

    // Get discount
    const shopifyAPI = getShopifyAPI();
    const discount = await shopifyAPI.getDiscountRule(discountId);
    
    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }

    // Resolve conflict
    if (!applicationEngine.shopifyAPI) {
      applicationEngine.init();
    }
    const result = await applicationEngine.resolveConflict(productId, discount, action);
    
    res.json({
      success: true,
      message: 'Conflict resolved',
      data: result
    });
  } catch (error) {
    console.error('Error resolving conflict:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

