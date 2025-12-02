import { getShopifyAPI } from '../middleware/calculatorInit.js';

/**
 * Get all stone pricing configurations
 */
export async function getStonePrices(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const stones = await shopifyAPI.getAllStonePricing();
    
    res.json({
      success: true,
      data: stones
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Create or update stone pricing
 */
export async function createOrUpdateStonePricing(req, res) {
  try {
    const stoneData = req.body;
    const shopifyAPI = getShopifyAPI();

    // Validate required fields
    if (!stoneData.stoneId || !stoneData.stoneType) {
      return res.status(400).json({
        success: false,
        error: 'Stone ID and type are required'
      });
    }

    let result;
    
    // If stone has an id (from Shopify metaobject), update it
    // Otherwise create new
    if (stoneData.id) {
      result = await shopifyAPI.updateStonePricing(stoneData.id, stoneData);
    } else {
      result = await shopifyAPI.createStonePricing(stoneData);
    }

    res.json({
      success: true,
      message: stoneData.id ? 'Stone pricing updated successfully' : 'Stone pricing created successfully',
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
 * Delete stone pricing
 */
export async function deleteStonePricing(req, res) {
  try {
    const stoneId = req.params.id;
    const shopifyAPI = getShopifyAPI();

    const mutation = `
      mutation DeleteStonePricing($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const result = await shopifyAPI.graphql(mutation, { id: stoneId });

    if (result.metaobjectDelete?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.metaobjectDelete.userErrors));
    }

    res.json({
      success: true,
      message: 'Stone pricing deleted successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

