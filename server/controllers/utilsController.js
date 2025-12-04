import { getPriceCalculator, getShopifyAPI } from '../middleware/calculatorInit.js';

/**
 * Health check endpoint
 */
export function healthCheck(req, res) {
  res.json({
    success: true,
    message: 'Jewelry Price App is running',
    timestamp: new Date().toISOString()
  });
}

/**
 * Get app status and configuration
 */
export async function getStatus(req, res) {
  try {
    const priceCalculator = getPriceCalculator();
    const shopifyAPI = getShopifyAPI();
    const metalRates = priceCalculator.getMetalRates();
    const products = await shopifyAPI.getConfiguredProducts();

    res.json({
      success: true,
      data: {
        metalRates,
        configuredProducts: products.length,
        shopName: process.env.SHOP_NAME,
        lastUpdated: new Date().toISOString()
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
 * Run Shopify setup to create metafield definitions
 */
export async function runSetup(req, res) {
  try {
    console.log('Running Shopify setup...');
    const shopifyAPI = getShopifyAPI();
    
    const setupLogs = [];
    
    // Create metafield definitions
    const metafields = [
      'metal_weight',
      'metal_type', 
      'making_charge_percent',
      'labour_type',
      'labour_value',
      'wastage_type',
      'wastage_value',
      'stone_cost',
      'tax_percent',
      'configured'
    ];

    for (const field of metafields) {
      try {
        const mutation = `
          mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition {
                id
                name
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const fieldType = ['metal_type', 'labour_type', 'wastage_type'].includes(field) 
          ? 'single_line_text_field' 
          : field === 'configured' 
            ? 'boolean' 
            : 'number_decimal';

        const definition = {
          name: field.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          namespace: 'jewelry_config',
          key: field,
          type: fieldType,
          ownerType: 'PRODUCT'
        };

        await shopifyAPI.graphql(mutation, { definition });
        setupLogs.push(`✅ Created metafield: ${field}`);
      } catch (error) {
        setupLogs.push(`⚠️  ${field} may already exist`);
      }
    }

    res.json({
      success: true,
      message: 'Setup completed! Metafield definitions created.',
      output: setupLogs.join('\n')
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Run setup via child process
 */
export async function runSetupScript(req, res) {
  try {
    console.log('Running setup via API endpoint...');
    
    // Import and run setup
    const { execSync } = await import('child_process');
    const output = execSync('node server/setup.js', { encoding: 'utf-8' });
    
    res.json({
      success: true,
      message: 'Setup completed successfully',
      output: output
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

