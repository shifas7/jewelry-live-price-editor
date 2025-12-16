/**
 * Discount Calculator Module
 * Handles discount calculations for different product types (Gold, Diamond, Silver)
 */

export class DiscountCalculator {
  constructor() {
    this.productTypes = {
      GOLD: 'gold',
      DIAMOND: 'diamond',
      SILVER: 'silver'
    };
  }

  /**
   * Detect product type based on metal type and stones
   * @param {Object} config - Product configuration
   * @param {Array} stonePricing - Optional array of stone pricing objects for accurate detection
   * @returns {string} - Product type: 'gold', 'diamond', or 'silver'
   */
  detectProductType(config, stonePricing = null) {
    const { metalType, stones = [] } = config;
    
    // Check if product has diamond stones
    let hasDiamond = false;
    
    if (stones.length > 0) {
      if (stonePricing && Array.isArray(stonePricing)) {
        // Use stone pricing to accurately detect diamond stones
        const stoneTypeMap = {};
        stonePricing.forEach(stone => {
          if (stone.stone_id && stone.stone_type) {
            stoneTypeMap[stone.stone_id] = stone.stone_type;
          }
        });
        
        hasDiamond = stones.some(stone => {
          const stoneId = stone.stoneType; // stone.stoneType contains the stone_id
          const actualStoneType = stoneTypeMap[stoneId];
          return actualStoneType && actualStoneType.toLowerCase() === 'diamond';
        });
      } else {
        // Fallback: check stoneType field directly (may not work correctly)
        hasDiamond = stones.some(stone => {
          const stoneType = stone.stoneType?.toLowerCase() || '';
          return stoneType.includes('diamond');
        });
      }
    }
    
    if (hasDiamond) {
      return this.productTypes.DIAMOND;
    }
    
    // Check if metal type is silver
    if (metalType?.toLowerCase().includes('silver')) {
      return this.productTypes.SILVER;
    }
    
    // Default to gold (for gold 24kt, 22kt, 18kt, 14kt)
    return this.productTypes.GOLD;
  }

  /**
   * Calculate discount amount based on product type and discount configuration
   * Supports both old format (single product type) and new unified format (all 3 types)
   * @param {Object} priceBreakdown - Price breakdown from PriceCalculator
   * @param {Object} config - Product configuration with stones and metal info
   * @param {Object} discountConfig - Discount configuration (old or new unified format)
   * @param {Array} stonePricing - Optional array of stone pricing objects for accurate product type detection
   * @returns {Object} - Discount calculation result
   */
  calculateDiscount(priceBreakdown, config, discountConfig, stonePricing = null) {
    // Check if enabled (old format) or if unified format with enabled rules
    const isEnabled = discountConfig?.enabled || 
      (discountConfig?.goldRules?.enabled || 
       discountConfig?.diamondRules?.enabled || 
       discountConfig?.silverRules?.enabled);
    
    if (!discountConfig || !isEnabled) {
      return {
        discountAmount: 0,
        discountType: null,
        discountAppliedOn: null,
        productType: this.detectProductType(config)
      };
    }

    const productType = this.detectProductType(config, stonePricing);
    let discountAmount = 0;
    let discountType = null;
    let discountAppliedOn = null;

    switch (productType) {
      case this.productTypes.GOLD:
        // Check if gold rules are enabled in unified format
        if (discountConfig.goldRules && !discountConfig.goldRules.enabled) {
          discountAmount = 0;
        } else {
          ({ discountAmount, discountType, discountAppliedOn } = this.calculateGoldDiscount(
            priceBreakdown,
            discountConfig
          ));
        }
        break;
      
      case this.productTypes.DIAMOND:
        // Check if diamond rules are enabled in unified format
        if (discountConfig.diamondRules && !discountConfig.diamondRules.enabled) {
          discountAmount = 0;
        } else {
          ({ discountAmount, discountType, discountAppliedOn } = this.calculateDiamondDiscount(
            priceBreakdown,
            discountConfig
          ));
        }
        break;
      
      case this.productTypes.SILVER:
        // Check if silver rules are enabled in unified format
        if (discountConfig.silverRules && !discountConfig.silverRules.enabled) {
          discountAmount = 0;
        } else {
          ({ discountAmount, discountType, discountAppliedOn } = this.calculateSilverDiscount(
            priceBreakdown,
            config,
            discountConfig
          ));
        }
        break;
      
      default:
        discountAmount = 0;
    }

    return {
      discountAmount: this.roundPrice(discountAmount),
      discountType,
      discountAppliedOn,
      productType
    };
  }

  /**
   * Calculate discount for Gold products (% on making charge)
   * IMPORTANT: Making Charge = Making + Labour + Wastage
   * @param {Object} priceBreakdown - Price breakdown
   * @param {Object} discountConfig - Discount configuration (can be old format or new goldRules format)
   * @returns {Object} - Discount details
   */
  calculateGoldDiscount(priceBreakdown, discountConfig) {
    // Support both old format (discountValue) and new format (goldRules.discount_percentage)
    let discountPercent = 0;
    if (discountConfig.goldRules && discountConfig.goldRules.enabled) {
      discountPercent = parseFloat(discountConfig.goldRules.discount_percentage) || 0;
    } else {
      discountPercent = parseFloat(discountConfig.discountValue) || 0;
    }

    // IMPORTANT: Making Charge = Making + Labour + Wastage
    const effectiveMakingCharge = 
      (priceBreakdown.makingCharge || 0) + 
      (priceBreakdown.labourCharge || 0) + 
      (priceBreakdown.wastageCharge || 0);
    
    const discountAmount = effectiveMakingCharge * (discountPercent / 100);

    return {
      discountAmount,
      discountType: 'percentage',
      discountAppliedOn: 'making_labour_wastage',
      effectiveMakingCharge: this.roundPrice(effectiveMakingCharge)
    };
  }

  /**
   * Calculate discount for Diamond products (fixed amount on stone cost)
   * @param {Object} priceBreakdown - Price breakdown
   * @param {Object} discountConfig - Discount configuration (can be old format or new diamondRules format)
   * @returns {Object} - Discount details
   */
  calculateDiamondDiscount(priceBreakdown, discountConfig) {
    // Support both old format (discountValue) and new format (diamondRules.discount_amount)
    let discountAmount = 0;
    if (discountConfig.diamondRules && discountConfig.diamondRules.enabled) {
      discountAmount = parseFloat(discountConfig.diamondRules.discount_amount) || 0;
    } else {
      discountAmount = parseFloat(discountConfig.discountValue) || 0;
    }
    
    const stoneCost = priceBreakdown.stoneCost || 0;
    
    // Discount cannot exceed stone cost
    const actualDiscount = Math.min(discountAmount, stoneCost);

    return {
      discountAmount: actualDiscount,
      discountType: 'fixed',
      discountAppliedOn: 'stone_cost'
    };
  }

  /**
   * Calculate discount for Silver products (weight-based slabs)
   * @param {Object} priceBreakdown - Price breakdown
   * @param {Object} config - Product configuration
   * @param {Object} discountConfig - Discount configuration (can be old format or new silverRules format)
   * @returns {Object} - Discount details
   */
  calculateSilverDiscount(priceBreakdown, config, discountConfig) {
    const metalWeight = parseFloat(config.metalWeight) || 0;
    
    // Support both old format (weightSlabs) and new format (silverRules.weight_slabs)
    let weightSlabs = [];
    if (discountConfig.silverRules && discountConfig.silverRules.enabled) {
      weightSlabs = discountConfig.silverRules.weight_slabs || [];
    } else {
      weightSlabs = discountConfig.weightSlabs || [];
    }

    // Find matching slab
    const matchingSlab = weightSlabs.find(slab => {
      const fromWeight = parseFloat(slab.from || slab.fromWeight) || 0;
      const toWeight = parseFloat(slab.to || slab.toWeight) || 0;
      return metalWeight >= fromWeight && metalWeight <= toWeight;
    });

    const discountAmount = matchingSlab ? (parseFloat(matchingSlab.amount || matchingSlab.discountAmount) || 0) : 0;

    return {
      discountAmount,
      discountType: 'slab',
      discountAppliedOn: 'weight_slab'
    };
  }

  /**
   * Validate discount configuration (for single product type - old format)
   * @param {string} productType - Product type
   * @param {Object} discountConfig - Discount configuration to validate
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  validateDiscountConfig(productType, discountConfig) {
    const errors = [];

    if (!discountConfig) {
      return { valid: false, errors: ['Discount configuration is required'] };
    }

    switch (productType) {
      case this.productTypes.GOLD:
        if (!discountConfig.discountValue || isNaN(discountConfig.discountValue)) {
          errors.push('Gold discount requires a percentage value');
        }
        if (parseFloat(discountConfig.discountValue) < 0 || parseFloat(discountConfig.discountValue) > 100) {
          errors.push('Gold discount percentage must be between 0 and 100');
        }
        break;

      case this.productTypes.DIAMOND:
        if (!discountConfig.discountValue || isNaN(discountConfig.discountValue)) {
          errors.push('Diamond discount requires a fixed amount value');
        }
        if (parseFloat(discountConfig.discountValue) < 0) {
          errors.push('Diamond discount amount must be positive');
        }
        break;

      case this.productTypes.SILVER:
        if (!discountConfig.weightSlabs || !Array.isArray(discountConfig.weightSlabs)) {
          errors.push('Silver discount requires weight slabs configuration');
        } else if (discountConfig.weightSlabs.length === 0) {
          errors.push('Silver discount requires at least one weight slab');
        } else {
          // Validate each slab
          discountConfig.weightSlabs.forEach((slab, index) => {
            if (isNaN(slab.fromWeight) || isNaN(slab.toWeight) || isNaN(slab.discountAmount)) {
              errors.push(`Slab ${index + 1}: All fields (fromWeight, toWeight, discountAmount) must be numeric`);
            }
            if (parseFloat(slab.fromWeight) > parseFloat(slab.toWeight)) {
              errors.push(`Slab ${index + 1}: fromWeight cannot be greater than toWeight`);
            }
            if (parseFloat(slab.discountAmount) < 0) {
              errors.push(`Slab ${index + 1}: discountAmount must be positive`);
            }
          });
        }
        break;

      default:
        errors.push('Invalid product type');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate unified discount configuration (all 3 product types required)
   * @param {Object} discountData - Unified discount data with goldRules, diamondRules, silverRules
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  validateUnifiedDiscountConfig(discountData) {
    const errors = [];

    if (!discountData) {
      return { valid: false, errors: ['Discount configuration is required'] };
    }

    // Validate Gold Rules
    if (!discountData.goldRules || !discountData.goldRules.enabled) {
      errors.push('Gold product rules must be configured and enabled');
    } else {
      const goldPercent = parseFloat(discountData.goldRules.discount_percentage);
      if (isNaN(goldPercent)) {
        errors.push('Gold discount percentage is required');
      } else if (goldPercent < 0 || goldPercent > 100) {
        errors.push('Gold discount percentage must be between 0 and 100');
      }
    }

    // Validate Diamond Rules
    if (!discountData.diamondRules || !discountData.diamondRules.enabled) {
      errors.push('Diamond product rules must be configured and enabled');
    } else {
      const diamondAmount = parseFloat(discountData.diamondRules.discount_amount);
      if (isNaN(diamondAmount)) {
        errors.push('Diamond discount amount is required');
      } else if (diamondAmount < 0) {
        errors.push('Diamond discount amount must be positive');
      }
    }

    // Validate Silver Rules
    if (!discountData.silverRules || !discountData.silverRules.enabled) {
      errors.push('Silver product rules must be configured and enabled');
    } else {
      const slabs = discountData.silverRules.weight_slabs || [];
      if (!Array.isArray(slabs) || slabs.length === 0) {
        errors.push('Silver discount requires at least one weight slab');
      } else {
        slabs.forEach((slab, index) => {
          const from = parseFloat(slab.from || slab.fromWeight);
          const to = parseFloat(slab.to || slab.toWeight);
          const amount = parseFloat(slab.amount || slab.discountAmount);
          
          if (isNaN(from) || isNaN(to) || isNaN(amount)) {
            errors.push(`Silver slab ${index + 1}: All fields (from, to, amount) must be numeric`);
          }
          if (from > to) {
            errors.push(`Silver slab ${index + 1}: from weight cannot be greater than to weight`);
          }
          if (amount < 0) {
            errors.push(`Silver slab ${index + 1}: discount amount must be positive`);
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Round price to 2 decimal places
   */
  roundPrice(amount) {
    return Math.round(amount * 100) / 100;
  }
}

export default DiscountCalculator;

