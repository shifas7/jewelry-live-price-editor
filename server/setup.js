import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const SHOP_NAME = process.env.SHOP_NAME;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2024-10";

async function graphql(query, variables = {}) {
  const response = await fetch(
    `https://${SHOP_NAME}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const result = await response.json();

  if (result.errors) {
    throw new Error(JSON.stringify(result.errors));
  }

  return result.data;
}

async function createMetalPricesMetaobject() {
  console.log("\n📦 Creating Metal Prices metaobject definition...");

  const mutation = `
    mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition {
          id
          name
          type
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const definition = {
    name: "Metal Prices",
    type: "metal_prices",
    fieldDefinitions: [
      {
        name: "Gold 24K",
        key: "gold_24kt",
        type: "number_decimal",
        required: true,
      },
      {
        name: "Gold 22K",
        key: "gold_22kt",
        type: "number_decimal",
        required: true,
      },
      {
        name: "Gold 18K",
        key: "gold_18kt",
        type: "number_decimal",
        required: true,
      },
      {
        name: "Gold 14K",
        key: "gold_14kt",
        type: "number_decimal",
        required: true,
      },
      {
        name: "Platinum",
        key: "platinum",
        type: "number_decimal",
        required: true,
      },
      { name: "Silver", key: "silver", type: "number_decimal", required: true },
      { name: "Last Updated", key: "last_updated", type: "date_time" },
    ],
  };

  try {
    const result = await graphql(mutation, { definition });
    console.log(
      "✅ Metal Prices metaobject created:",
      result.metaobjectDefinitionCreate.metaobjectDefinition.id
    );
  } catch (error) {
    console.log(
      "⚠️  Metal Prices metaobject may already exist or error:",
      error.message
    );
  }
}

async function createStonePricingMetaobject() {
  console.log("\n💎 Creating Stone Pricing metaobject definition...");

  const mutation = `
    mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition {
          id
          name
          type
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const definition = {
    name: "Stone Pricing",
    type: "stone_pricing",
    fieldDefinitions: [
      {
        name: "Stone ID",
        key: "stone_id",
        type: "single_line_text_field",
        required: true,
      },
      {
        name: "Stone Type",
        key: "stone_type",
        type: "single_line_text_field",
        required: true,
      },
      { name: "Title", key: "title", type: "single_line_text_field" },
      { name: "Clarity", key: "clarity", type: "single_line_text_field" },
      { name: "Color", key: "color", type: "single_line_text_field" },
      { name: "Shape", key: "shape", type: "single_line_text_field" },
      { name: "Slabs", key: "slabs", type: "json" },
    ],
  };

  try {
    const result = await graphql(mutation, { definition });
    console.log(
      "✅ Stone Pricing metaobject created:",
      result.metaobjectDefinitionCreate.metaobjectDefinition.id
    );
  } catch (error) {
    console.log(
      "⚠️  Stone Pricing metaobject may already exist or error:",
      error.message
    );
  }
}

async function createProductMetafieldDefinitions() {
  console.log("\n⚙️  Creating Product metafield definitions...");

  const metafields = [
    { name: "Metal Weight", key: "metal_weight", type: "number_decimal" },
    { name: "Metal Type", key: "metal_type", type: "single_line_text_field" },
    {
      name: "Making Charge Percent",
      key: "making_charge_percent",
      type: "number_decimal",
    },
    { name: "Labour Type", key: "labour_type", type: "single_line_text_field" },
    { name: "Labour Value", key: "labour_value", type: "number_decimal" },
    {
      name: "Wastage Type",
      key: "wastage_type",
      type: "single_line_text_field",
    },
    { name: "Wastage Value", key: "wastage_value", type: "number_decimal" },
    { name: "Stone Cost", key: "stone_cost", type: "number_decimal" },
    { name: "Tax Percent", key: "tax_percent", type: "number_decimal" },
    { name: "Configured", key: "configured", type: "boolean" },
  ];

  for (const field of metafields) {
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

    const definition = {
      name: field.name,
      namespace: "jewelry_config",
      key: field.key,
      type: field.type,
      ownerType: "PRODUCT",
    };

    try {
      await graphql(mutation, { definition });
      console.log(`  ✅ Created: ${field.name}`);
    } catch (error) {
      console.log(`  ⚠️  ${field.name} may already exist`);
    }
  }
}

async function initializeDefaultMetalPrices() {
  console.log("\n💰 Initializing default metal prices...");

  const mutation = `
    mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const metaobject = {
    type: "metal_prices",
    fields: [
      { key: "gold_24kt", value: "7000" },
      { key: "gold_22kt", value: "6500" },
      { key: "gold_18kt", value: "5500" },
      { key: "gold_14kt", value: "4500" },
      { key: "platinum", value: "3000" },
      { key: "silver", value: "80" },
      { key: "last_updated", value: new Date().toISOString() },
    ],
  };

  try {
    const result = await graphql(mutation, { metaobject });
    console.log("✅ Default metal prices initialized");
  } catch (error) {
    console.log(
      "⚠️  Default prices may already exist or error:",
      error.message
    );
  }
}

async function setup() {
  console.log("\n🚀 Starting Shopify Jewelry Price App Setup...\n");
  console.log("Shop:", SHOP_NAME);
  console.log("===================================");

  try {
    // Create metaobject definitions
    await createMetalPricesMetaobject();
    await createStonePricingMetaobject();

    // Create product metafield definitions
    await createProductMetafieldDefinitions();

    // Initialize default metal prices
    await initializeDefaultMetalPrices();

    console.log("\n✅ Setup completed successfully!");
    console.log("\n📋 Next steps:");
    console.log("1. Update metal prices in the Dashboard");
    console.log("2. Configure your products");
    console.log('3. Click "Refresh Prices" to update all product prices');
    console.log("\n🌐 Start the server: npm run dev");
    console.log("   Then open: http://localhost:3000/index.html\n");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
  }
}

setup();
