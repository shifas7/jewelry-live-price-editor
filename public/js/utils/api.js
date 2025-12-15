/**
 * API Base URL - automatically detects localhost vs deployed
 */
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3010/api'
    : `${window.location.protocol}//${window.location.host}/api`;

console.log('API Base URL:', API_BASE);

// Make API functions available globally
window.API = {
    /**
     * Fetch metal prices
     */
    async fetchMetalPrices() {
        const response = await fetch(`${API_BASE}/metal-prices`);
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to fetch metal prices');
    },

    /**
     * Update metal prices
     */
    async updateMetalPrices(prices) {
        const response = await fetch(`${API_BASE}/metal-prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prices)
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to update metal prices');
    },

    /**
     * Refresh all product prices
     */
    async refreshPrices() {
        const response = await fetch(`${API_BASE}/refresh-prices`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to refresh prices');
    },

    /**
     * Fetch products with pagination
     */
    async fetchProducts(cursor = null, limit = 50) {
        let url = `${API_BASE}/products?limit=${limit}`;
        if (cursor) {
            url += `&cursor=${encodeURIComponent(cursor)}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        if (data.success) {
            return {
                products: data.data,
                pageInfo: data.pageInfo
            };
        }
        throw new Error(data.error || 'Failed to fetch products');
    },

    /**
     * Search products
     */
    async searchProducts(query) {
        const response = await fetch(`${API_BASE}/products/search?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to search products');
    },

    /**
     * Fetch product configuration
     */
    async fetchProductConfiguration(productId) {
        const response = await fetch(`${API_BASE}/products/${productId}`);
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to fetch product configuration');
    },

    /**
     * Configure product
     */
    async configureProduct(productId, config) {
        const response = await fetch(`${API_BASE}/products/${productId}/configure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to configure product');
    },

    /**
     * Calculate price (preview)
     * @param {Object} config - Product configuration
     * @param {Object} discount - Optional discount configuration
     */
    async calculatePrice(config, discount = null) {
        const requestBody = discount 
            ? { config, discount }
            : config;
        
        const response = await fetch(`${API_BASE}/calculate-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to calculate price');
    },

    /**
     * Fetch stone prices
     */
    async fetchStonePrices() {
        const response = await fetch(`${API_BASE}/stone-prices`);
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to fetch stone prices');
    },

    /**
     * Create or update stone pricing
     */
    async saveStonePricing(stoneData) {
        const response = await fetch(`${API_BASE}/stone-prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stoneData)
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to save stone pricing');
    },

    /**
     * Delete stone pricing
     */
    async deleteStonePricing(stoneId) {
        const response = await fetch(`${API_BASE}/stone-prices/${stoneId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to delete stone pricing');
    },

    /**
     * Fetch all discount rules
     */
    async fetchDiscounts() {
        const response = await fetch(`${API_BASE}/discounts`);
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to fetch discounts');
    },

    /**
     * Create new unified discount (auto-applies)
     */
    async createDiscount(discountData) {
        const response = await fetch(`${API_BASE}/discounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discountData)
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to create discount');
    },

    /**
     * Update unified discount (re-applies)
     */
    async updateDiscount(ruleId, discountData) {
        const response = await fetch(`${API_BASE}/discounts/${ruleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discountData)
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to update discount');
    },

    /**
     * Delete discount rule
     */
    async deleteDiscount(ruleId) {
        // URL encode the ruleId to handle GIDs with slashes
        const encodedRuleId = encodeURIComponent(ruleId);
        const response = await fetch(`${API_BASE}/discounts/${encodedRuleId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to delete discount');
    },

    /**
     * Apply discount to bulk selected products
     */
    async applyBulkDiscount(productIds, discountConfig) {
        const response = await fetch(`${API_BASE}/discounts/apply-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds, discountConfig })
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to apply bulk discount');
    },

    /**
     * Apply discount to collection
     */
    async applyCollectionDiscount(collectionId, discountConfig) {
        const response = await fetch(`${API_BASE}/discounts/apply-collection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collectionId, discountConfig })
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to apply collection discount');
    },

    /**
     * Fetch Shopify collections
     */
    async fetchCollections() {
        const response = await fetch(`${API_BASE}/discounts/collections`);
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to fetch collections');
    },

    /**
     * Search products by SKU
     */
    async searchBySku(query) {
        const response = await fetch(`${API_BASE}/products/search-by-sku?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to search by SKU');
    },

    /**
     * Validate bulk SKUs
     */
    async validateBulkSkus(skus) {
        const response = await fetch(`${API_BASE}/products/validate-skus`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus })
        });
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || 'Failed to validate SKUs');
    },

    /**
     * Resolve discount conflict
     */
    async resolveConflict(resolution) {
        const response = await fetch(`${API_BASE}/discounts/resolve-conflict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resolution)
        });
        const data = await response.json();
        if (data.success) {
            return data;
        }
        throw new Error(data.error || 'Failed to resolve conflict');
    }
};
