const { useState, useEffect } = React;

function ProductsTab({ products, loading, setSelectedProduct }) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const API = window.API || {};

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchError("Please enter a search query");
      return;
    }

    try {
      setSearchLoading(true);
      setSearchError(null);
      const results = await API.searchProducts(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching products:", error);
      setSearchError(error.message || "Failed to search products");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchError(null);
    setShowSearch(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Determine which products to display
  const displayProducts = searchResults !== null ? searchResults : products;
  const isSearchMode = searchResults !== null;

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h2>Products</h2>
        <button
          className="btn btn-secondary"
          onClick={() => setShowSearch(!showSearch)}
        >
          {showSearch ? "Cancel Search" : "Search Products"}
        </button>
      </div>

      {showSearch && (
        <div
          style={{
            marginBottom: "16px",
            padding: "16px",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search by product name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={searchLoading}
            >
              {searchLoading ? "Searching..." : "Search"}
            </button>
            {isSearchMode && (
              <button className="btn btn-secondary" onClick={handleClearSearch}>
                Clear
              </button>
            )}
          </div>
          {searchError && (
            <div
              style={{ marginTop: "8px", color: "#d32f2f", fontSize: "14px" }}
            >
              {searchError}
            </div>
          )}
          {isSearchMode && !searchLoading && (
            <div style={{ marginTop: "8px", fontSize: "14px", color: "#666" }}>
              Found {displayProducts.length} product(s)
            </div>
          )}
        </div>
      )}

      {loading || searchLoading ? (
        <div className="loading">Loading products...</div>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Status</th>
              <th>Configuration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayProducts.map((product, idx) => (
              <tr key={idx}>
                <td>
                  <div style={{ fontWeight: 500 }}>{product.title}</div>
                  <div style={{ fontSize: "12px", color: "#6d7175" }}>
                    Vendor: {product.vendor} • 1 variant
                  </div>
                </td>
                <td>
                  <span
                    className={`badge badge-${product.status.toLowerCase()}`}
                  >
                    {product.status}
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${
                      product.configuration?.configured
                        ? "badge-success"
                        : "badge-pending"
                    }`}
                  >
                    {product.configuration?.configured
                      ? "Configured"
                      : "Pending"}
                  </span>
                </td>
                <td>
                  <button
                    className="link-button"
                    onClick={() => setSelectedProduct(product)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {displayProducts.length === 0 && (
              <tr>
                <td
                  colSpan="4"
                  style={{ textAlign: "center", color: "#6d7175" }}
                >
                  {isSearchMode
                    ? "No products found matching your search"
                    : "No configured products found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Make available globally
window.ProductsTab = ProductsTab;
