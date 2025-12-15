/**
 * Webhook Setup Script
 * Registers Shopify webhooks for collection sync
 * Run once: node server/webhooks/setup.js
 */

import dotenv from 'dotenv';
import { ShopifyAPI } from '../utils/shopifyAPI.js';

dotenv.config();

const shop = (process.env.SHOP_NAME || process.env.SHOPIFY_SHOP || '').replace(/\/$/, '');
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
const HOST = process.env.HOST || 'https://your-app-url.com';

if (!shop || !accessToken) {
  console.error('❌ Missing SHOP_NAME or SHOPIFY_ACCESS_TOKEN in .env file');
  process.exit(1);
}

const shopifyAPI = new ShopifyAPI(shop, accessToken);

async function registerWebhook(topic, address) {
  const mutation = `
    mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription {
          id
          callbackUrl
          format
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const result = await shopifyAPI.graphql(mutation, {
      topic,
      webhookSubscription: {
        callbackUrl: address,
        format: 'JSON'
      }
    });

    if (result.webhookSubscriptionCreate?.userErrors?.length > 0) {
      const errors = result.webhookSubscriptionCreate.userErrors;
      const alreadyExists = errors.some(e => 
        e.message.includes('already') || e.message.includes('exists')
      );
      
      if (alreadyExists) {
        console.log(`✅ Webhook ${topic} already registered`);
        return true;
      } else {
        console.error(`❌ Error registering ${topic}:`, errors);
        return false;
      }
    }

    console.log(`✅ Successfully registered webhook: ${topic}`);
    console.log(`   URL: ${address}`);
    return true;
  } catch (error) {
    console.error(`❌ Error registering ${topic}:`, error.message);
    return false;
  }
}

async function listExistingWebhooks() {
  const query = `
    query {
      webhookSubscriptions(first: 50) {
        edges {
          node {
            id
            callbackUrl
            topic
            format
          }
        }
      }
    }
  `;

  try {
    const result = await shopifyAPI.graphql(query);
    return result.webhookSubscriptions?.edges?.map(e => e.node) || [];
  } catch (error) {
    console.error('Error listing webhooks:', error);
    return [];
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('SHOPIFY WEBHOOK SETUP');
  console.log('='.repeat(60));
  console.log(`Shop: ${shop}`);
  console.log(`Host: ${HOST}\n`);

  // List existing webhooks
  console.log('Checking existing webhooks...');
  const existing = await listExistingWebhooks();
  console.log(`Found ${existing.length} existing webhook(s)\n`);

  // Register webhooks
  const webhooks = [
    {
      topic: 'COLLECTIONS_UPDATE',
      address: `${HOST}/webhooks/collections/update`
    },
    {
      topic: 'PRODUCTS_DELETE',
      address: `${HOST}/webhooks/products/delete`
    }
  ];

  console.log('Registering webhooks...\n');
  
  let successCount = 0;
  for (const webhook of webhooks) {
    const success = await registerWebhook(webhook.topic, webhook.address);
    if (success) successCount++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Registered ${successCount} of ${webhooks.length} webhooks`);
  console.log('='.repeat(60));
  
  if (successCount < webhooks.length) {
    console.log('\n⚠️  Some webhooks failed to register.');
    console.log('💡 Make sure your HOST URL is publicly accessible and points to your server.');
    console.log('💡 For local development, use a tunneling service like ngrok.');
  } else {
    console.log('\n🎉 All webhooks registered successfully!');
  }
}

main().catch(console.error);

