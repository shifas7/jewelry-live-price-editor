/**
 * Setup Script to Create Required Metaobject Definitions in Shopify
 * Run once: node server/setup-metaobjects.js
 */

import dotenv from 'dotenv';
import { ShopifyAPI } from './utils/shopifyAPI.js';

dotenv.config();

// Support both SHOPIFY_SHOP and SHOP_NAME for compatibility
const shop = (process.env.SHOPIFY_SHOP || process.env.SHOP_NAME || '').replace(/\/$/, ''); // Remove trailing slash
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

if (!shop || !accessToken) {
  console.error('❌ Missing SHOP_NAME (or SHOPIFY_SHOP) or SHOPIFY_ACCESS_TOKEN in .env file');
  console.error('Current values:');
  console.error('  SHOP_NAME:', process.env.SHOP_NAME || 'not set');
  console.error('  SHOPIFY_SHOP:', process.env.SHOPIFY_SHOP || 'not set');
  console.error('  SHOPIFY_ACCESS_TOKEN:', process.env.SHOPIFY_ACCESS_TOKEN ? 'set' : 'not set');
  process.exit(1);
}

const shopifyAPI = new ShopifyAPI(shop, accessToken);

async function findDiscountRulesDefinition() {
  // Query all definitions and filter for discount_rules
  const query = `
    query {
      metaobjectDefinitions(first: 50) {
        nodes {
          id
          name
          type
        }
      }
    }
  `;
  
  try {
    const result = await shopifyAPI.graphql(query);
    const definitions = result.metaobjectDefinitions?.nodes || [];
    const discountDef = definitions.find(def => def.type === 'discount_rules');
    
    if (discountDef) {
      console.log(`Found discount_rules definition: ${discountDef.name} (${discountDef.id})`);
      return discountDef;
    }
  } catch (error) {
    console.log(`Query failed: ${error.message}`);
  }
  
  return null;
}

async function deleteDiscountRulesMetaobjectDefinition() {
  console.log('\n⚠️  WARNING: This will delete the existing discount_rules metaobject definition.');
  console.log('   All existing discount metaobjects will be permanently deleted!');
  console.log('   You will need to recreate your discounts after this.\n');
  
  // Find the existing definition using multiple strategies
  const definition = await findDiscountRulesDefinition();
  
  if (!definition) {
    console.log('ℹ️  No existing discount_rules definition found in queries.');
    console.log('   However, if you see "Type has already been taken" error,');
    console.log('   the definition may exist but be inaccessible via API.');
    console.log('   Please delete it manually in Shopify Admin:');
    console.log('   Settings → Custom Data → Metaobjects → Find "discount_rules" → Delete');
    return false;
  }
  
  const definitionId = definition.id;
  console.log(`Attempting to delete: ${definition.name} (${definitionId})`);
  
  // Delete the definition
  const mutation = `
    mutation DeleteMetaobjectDefinition($id: ID!) {
      metaobjectDefinitionDelete(id: $id) {
        deletedId
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  try {
    const deleteResult = await shopifyAPI.graphql(mutation, { id: definitionId });
    
    if (deleteResult.metaobjectDefinitionDelete?.userErrors?.length > 0) {
      const errors = deleteResult.metaobjectDefinitionDelete.userErrors;
      console.error('❌ Error deleting metaobject definition:');
      errors.forEach(err => console.error(`   - ${err.message}`));
      return false;
    }
    
    console.log('✅ Successfully deleted existing discount_rules metaobject definition');
    console.log('   Deleted ID:', deleteResult.metaobjectDefinitionDelete.deletedId);
    return true;
  } catch (error) {
    console.error('❌ Error deleting metaobject definition:', error.message);
    return false;
  }
}

async function createDiscountRulesMetaobjectDefinition() {
  console.log('Creating discount_rules metaobject definition...');
  
  const mutation = `
    mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition {
          id
          name
          type
          fieldDefinitions {
            key
            name
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const definition = {
    name: 'Discount Rules',
    type: 'discount_rules',
    fieldDefinitions: [
      // New unified structure fields
      {
        key: 'discount_title',
        name: 'Discount Title',
        type: 'single_line_text_field',
        required: true
      },
      {
        key: 'application_type',
        name: 'Application Type',
        type: 'single_line_text_field',
        required: true,
        description: 'collection or products'
      },
      {
        key: 'target_collection_id',
        name: 'Target Collection ID',
        type: 'single_line_text_field',
        required: false
      },
      {
        key: 'target_product_ids',
        name: 'Target Product IDs',
        type: 'json',
        required: false
      },
      {
        key: 'gold_rules',
        name: 'Gold Rules',
        type: 'json',
        required: false
      },
      {
        key: 'diamond_rules',
        name: 'Diamond Rules',
        type: 'json',
        required: false
      },
      {
        key: 'silver_rules',
        name: 'Silver Rules',
        type: 'json',
        required: false
      },
      {
        key: 'is_active',
        name: 'Is Active',
        type: 'single_line_text_field',
        required: false
      },
      {
        key: 'created_at',
        name: 'Created At',
        type: 'date_time',
        required: false
      },
      {
        key: 'last_applied',
        name: 'Last Applied',
        type: 'date_time',
        required: false
      },
      // Old format fields (for backward compatibility)
      {
        key: 'rule_name',
        name: 'Rule Name (Legacy)',
        type: 'single_line_text_field',
        required: false
      },
      {
        key: 'product_type',
        name: 'Product Type (Legacy)',
        type: 'single_line_text_field',
        required: false
      },
      {
        key: 'discount_type',
        name: 'Discount Type (Legacy)',
        type: 'single_line_text_field',
        required: false
      },
      {
        key: 'discount_value',
        name: 'Discount Value (Legacy)',
        type: 'number_decimal',
        required: false
      },
      {
        key: 'weight_slabs',
        name: 'Weight Slabs (Legacy)',
        type: 'json',
        required: false
      }
    ]
  };

  try {
    const result = await shopifyAPI.graphql(mutation, { definition });
    
    if (result.metaobjectDefinitionCreate?.userErrors?.length > 0) {
      const errors = result.metaobjectDefinitionCreate.userErrors;
      const typeTaken = errors.some(e => 
        e.message.includes('already been taken') || 
        e.message.includes('Type has already been taken')
      );
      
      if (typeTaken) {
        console.log('⚠️  Type "discount_rules" already exists but was not found in queries.');
        console.log('   This usually means the definition exists but is not accessible via API.');
        console.log('   Attempting to find and delete it...');
        return 'TYPE_EXISTS';
      }
      
      console.error('❌ Error creating metaobject definition:');
      errors.forEach(err => console.error(`   - ${err.message}`));
      return false;
    }
    
    console.log('✅ Successfully created discount_rules metaobject definition');
    console.log('   ID:', result.metaobjectDefinitionCreate.metaobjectDefinition.id);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function verifyExistingMetaobjects() {
  console.log('\nVerifying existing metaobject definitions...');
  
  const query = `
    query {
      metaobjectDefinitions(first: 50) {
        nodes {
          id
          name
          type
        }
      }
    }
  `;
  
  try {
    const result = await shopifyAPI.graphql(query);
    const definitions = result.metaobjectDefinitions?.nodes || [];
    
    console.log(`Found ${definitions.length} metaobject definition(s):`);
    definitions.forEach(def => {
      console.log(`  - ${def.name} (${def.type})`);
    });
    
    const hasDiscountRules = definitions.some(def => def.type === 'discount_rules');
    const hasStonePricing = definitions.some(def => def.type === 'stone_pricing');
    const hasMetalPrices = definitions.some(def => def.type === 'metal_prices');
    
    console.log('\n📋 Status:');
    console.log(`  ${hasDiscountRules ? '✅' : '❌'} discount_rules`);
    console.log(`  ${hasStonePricing ? '✅' : '❌'} stone_pricing`);
    console.log(`  ${hasMetalPrices ? '✅' : '❌'} metal_prices`);
    
    return hasDiscountRules;
  } catch (error) {
    console.error('❌ Error verifying metaobjects:', error.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('SHOPIFY METAOBJECT SETUP');
  console.log('='.repeat(60));
  console.log(`Shop: ${shop}\n`);
  
  // First verify what exists
  const hasDiscountRules = await verifyExistingMetaobjects();
  
  if (hasDiscountRules) {
    console.log('\n⚠️  WARNING: Existing discount_rules definition found!');
    console.log('   This script will DELETE the existing definition and all discount metaobjects.');
    console.log('   You will need to recreate all your discounts after this.\n');
    
    // Delete existing definition
    const deleted = await deleteDiscountRulesMetaobjectDefinition();
    if (!deleted) {
      console.log('\n❌ Failed to delete existing definition. Aborting.');
      console.log('   Please delete it manually in Shopify Admin if needed.');
      console.log('\n' + '='.repeat(60));
      return;
    }
  }
  
  // Create new definition with updated fields
  console.log('\n📝 Creating new discount_rules metaobject definition...');
  let created = await createDiscountRulesMetaobjectDefinition();
  
  // If type exists but wasn't found, try to delete it
  if (created === 'TYPE_EXISTS') {
    console.log('\n🔄 Type exists but wasn\'t found. Attempting to delete...');
    const deleted = await deleteDiscountRulesMetaobjectDefinition();
    
    if (deleted) {
      console.log('\n📝 Retrying creation after deletion...');
      created = await createDiscountRulesMetaobjectDefinition();
    } else {
      console.log('\n❌ Could not delete existing definition via API.');
      console.log('   Please delete it manually in Shopify Admin:');
      console.log('   1. Go to Settings → Custom Data → Metaobjects');
      console.log('   2. Find the "discount_rules" definition');
      console.log('   3. Delete it');
      console.log('   4. Run this script again');
      created = false;
    }
  }
  
  if (created === true) {
    console.log('\n🎉 Setup complete! You can now create discount rules using the unified structure.');
    if (hasDiscountRules) {
      console.log('⚠️  Remember: All previous discounts were deleted. Please recreate them.');
    }
  } else if (created !== 'TYPE_EXISTS') {
    console.log('\n⚠️  Setup failed. Please check the errors above.');
    console.log('\n💡 Alternative: Create the metaobject definition manually in Shopify Admin:');
    console.log('   1. Go to Settings → Custom Data → Metaobjects');
    console.log('   2. Click "Add definition"');
    console.log('   3. Name: "Discount Rules", Type: "discount_rules"');
    console.log('   4. Add fields: discount_title, application_type, target_collection_id,');
    console.log('      target_product_ids, gold_rules, diamond_rules, silver_rules,');
    console.log('      is_active, created_at, last_applied');
  }
  
  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);

