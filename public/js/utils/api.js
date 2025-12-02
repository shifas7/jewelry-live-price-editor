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
     * Fetch all products
     */
    async fetchProducts() {
        const response = await fetch(`${API_BASE}/products`);
        const data = await response.json();
        if (data.success) {
            return data.data;
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
     */
    async calculatePrice(config) {
        const response = await fetch(`${API_BASE}/calculate-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
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
    }
};
