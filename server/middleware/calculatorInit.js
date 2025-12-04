import { PriceCalculator, StoneCalculator } from '../utils/priceCalculator.js';
import ShopifyAPI from '../utils/shopifyAPI.js';

/**
 * Initialize calculator instances
 * This module manages global calculator instances
 */

let priceCalculator;
let stoneCalculator;
let shopifyAPI;

/**
 * Initialize Shopify API instance
 */
export function initializeShopifyAPI() {
  if (!shopifyAPI) {
    shopifyAPI = new ShopifyAPI(
      process.env.SHOP_NAME,
      process.env.SHOPIFY_ACCESS_TOKEN
    );
  }
  return shopifyAPI;
}

/**
 * Initialize calculators with current rates
 */
export async function initializeCalculators() {
  try {
    const api = initializeShopifyAPI();
    const metalRates = await api.getMetalPrices();
    
    if (metalRates) {
      priceCalculator = new PriceCalculator(metalRates);
      console.log('✅ Price calculator initialized with current metal rates');
    } else {
      // Default rates if not set
      priceCalculator = new PriceCalculator({
        gold24kt: 7000,
        gold22kt: 6500,
        gold18kt: 5500,
        gold14kt: 4500,
        platinum: 3000,
        silver: 80
      });
      console.log('⚠️  Price calculator initialized with default rates');
    }

    // Initialize stone calculator
    const stonePrices = await api.getAllStonePricing();
    stoneCalculator = new StoneCalculator(stonePrices);
    console.log('✅ Stone calculator initialized');
  } catch (error) {
    console.error('❌ Error initializing calculators:', error);
  }
}

/**
 * Get price calculator instance
 */
export function getPriceCalculator() {
  if (!priceCalculator) {
    throw new Error('Price calculator not initialized. Call initializeCalculators() first.');
  }
  return priceCalculator;
}

/**
 * Get stone calculator instance
 */
export function getStoneCalculator() {
  if (!stoneCalculator) {
    throw new Error('Stone calculator not initialized. Call initializeCalculators() first.');
  }
  return stoneCalculator;
}

/**
 * Get Shopify API instance
 */
export function getShopifyAPI() {
  if (!shopifyAPI) {
    initializeShopifyAPI();
  }
  return shopifyAPI;
}

/**
 * Update price calculator metal rates
 */
export function updatePriceCalculatorRates(newRates) {
  if (priceCalculator) {
    priceCalculator.updateMetalRates(newRates);
  }
}

