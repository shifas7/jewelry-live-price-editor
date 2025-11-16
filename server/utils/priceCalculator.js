/**
 * Jewelry Price Calculation Module
 * Based on the calculation details provided
 */

export class PriceCalculator {
  constructor(metalRates) {
    this.metalRates = metalRates; // Object with gold24kt, gold22kt, gold18kt, gold14kt, platinum, silver
  }

  /**
   * Calculate complete product pricing
   * @param {Object} config - Product configuration
   * @returns {Object} Detailed price breakdown
   */
  calculatePrice(config) {
    const {
      metalWeight,        // in grams
      metalType,          // 'gold24kt', 'gold22kt', 'gold18kt', 'gold14kt', 'platinum', 'silver'
      makingChargePercent,
      labourType,         // 'percentage' or 'fixed'
      labourValue,
      wastageType,        // 'percentage', 'fixed', or 'weight'
      wastageValue,
      stoneCost,          // total stone cost in INR
      taxPercent,         // GST/VAT percentage
      serviceChargePercent = 0 // optional service charge
    } = config;

    // Convert to numbers and handle empty values
    const weight = parseFloat(metalWeight) || 0;
    const makingPercent = parseFloat(makingChargePercent) || 0;
    const labourVal = parseFloat(labourValue) || 0;
    const wastageVal = parseFloat(wastageValue) || 0;
    const stone = parseFloat(stoneCost) || 0;
    const tax = parseFloat(taxPercent) || 0;

    // Get metal rate per gram
    const metalRate = this.metalRates[metalType] || 0;

    // 1. Metal Cost
    const metalCost = weight * metalRate;

    // 2. Making Charge (percentage of metal cost)
    const makingCharge = metalCost * (makingPercent / 100);

    // 3. Labour Charge
    let labourCharge = 0;
    if (labourType === 'percentage') {
      labourCharge = metalCost * (labourVal / 100);
    } else if (labourType === 'fixed') {
      labourCharge = labourVal;
    }

    // 4. Wastage Charge
    let wastageCharge = 0;
    if (wastageType === 'percentage') {
      wastageCharge = metalCost * (wastageVal / 100);
    } else if (wastageType === 'fixed') {
      wastageCharge = wastageVal;
    } else if (wastageType === 'weight') {
      // wastageValue is in grams
      wastageCharge = wastageVal * metalRate;
    }

    // 5. Service Charge (Making + Labour + Wastage)
    const serviceCharge = makingCharge + labourCharge + wastageCharge;

    // 6. Subtotal (before tax)
    const subtotal = metalCost + makingCharge + labourCharge + wastageCharge + stone;

    // 7. Tax Amount
    const taxAmount = subtotal * (tax / 100);

    // 8. Final Product Price
    const finalPrice = subtotal + taxAmount;

    return {
      metalCost: this.roundPrice(metalCost),
      makingCharge: this.roundPrice(makingCharge),
      labourCharge: this.roundPrice(labourCharge),
      wastageCharge: this.roundPrice(wastageCharge),
      serviceCharge: this.roundPrice(serviceCharge),
      stoneCost: this.roundPrice(stone),
      subtotal: this.roundPrice(subtotal),
      taxAmount: this.roundPrice(taxAmount),
      finalPrice: this.roundPrice(finalPrice),
      breakdown: {
        metalWeight: weight,
        metalType,
        metalRate,
        makingChargePercent: makingPercent,
        labourType,
        labourValue: labourVal,
        wastageType,
        wastageValue: wastageVal,
        taxPercent: tax
      }
    };
  }

  /**
   * Round price to 2 decimal places
   */
  roundPrice(amount) {
    return Math.round(amount * 100) / 100;
  }

  /**
   * Update metal rates
   */
  updateMetalRates(newRates) {
    this.metalRates = { ...this.metalRates, ...newRates };
  }

  /**
   * Get current metal rates
   */
  getMetalRates() {
    return this.metalRates;
  }
}

/**
 * Stone Price Calculator
 */
export class StoneCalculator {
  constructor(stonePrices) {
    this.stonePrices = stonePrices; // Object with stone types and their slab pricing
  }

  /**
   * Calculate stone cost based on weight and slabs
   * @param {string} stoneType - Type of stone (e.g., 'diamond', 'ruby')
   * @param {number} carats - Weight in carats
   * @returns {number} Total stone cost
   */
  calculateStoneCost(stoneType, carats) {
    const stoneConfig = this.stonePrices[stoneType];
    if (!stoneConfig || !stoneConfig.slabs) {
      return 0;
    }

    // Find the applicable slab
    const slab = stoneConfig.slabs.find(s => 
      carats >= s.fromWeight && carats <= s.toWeight
    );

    if (!slab) {
      return 0;
    }

    return carats * slab.pricePerCarat;
  }

  /**
   * Calculate total cost for multiple stones
   * @param {Array} stones - Array of {type, carats} objects
   * @returns {number} Total cost
   */
  calculateMultipleStoneCost(stones) {
    return stones.reduce((total, stone) => {
      return total + this.calculateStoneCost(stone.type, stone.carats);
    }, 0);
  }
}

export default { PriceCalculator, StoneCalculator };