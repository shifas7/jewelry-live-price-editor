const { useState } = React;

function ProductSelector({ selectedProductIds = [], onSelect, onClose }) {
  const API = window.API || {};
  
  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [bulkSkus, setBulkSkus] = useState('');
  const [validating, setValidating] = useState(false);
  const [validatedProducts, setValidatedProducts] = useState([]);
  const [invalidSkus, setInvalidSkus] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Load initially selected products
  React.useEffect(() => {
    if (selectedProductIds.length > 0) {
      // Fetch product details for selected IDs
      Promise.all(
        selectedProductIds.map(async (id) => {
          try {
            const config = await API.fetchProductConfiguration(id);
            return {
              id: id,
              title: config.productTitle || config.title || 'Unknown Product',
              sku: config.sku || 'N/A'
            };
          } catch {
            return {
              id: id,
              title: 'Product (ID: ' + id.split('/').pop() + ')',
              sku: 'N/A'
            };
          }
        })
      ).then(products => {
        setSelectedProducts(products);
      });
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    try {
      setSearching(true);
      const results = await API.searchBySku(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching:', error);
      alert('Error: Error searching products: ' + error.message);
    } finally {
      setSearching(false);
    }
  };

  const handleAddProduct = (product) => {
    if (!selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts([...selectedProducts, product]);
    }
  };

  const handleRemoveProduct = (productId) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== productId));
  };

  const handleValidateBulkSkus = async () => {
    if (!bulkSkus.trim()) {
      return;
    }

    try {
      setValidating(true);
      // Parse SKUs from text (comma or line separated)
      const skus = bulkSkus
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const result = await API.validateBulkSkus(skus);
      setValidatedProducts(result.valid || []);
      setInvalidSkus(result.invalid || []);

      // Add valid products to selection
      const newProducts = (result.valid || []).map(p => ({
        id: p.id,
        title: p.title,
        sku: p.sku
      }));

      // Merge with existing, avoiding duplicates
      const merged = [...selectedProducts];
      newProducts.forEach(newProduct => {
        if (!merged.find(p => p.id === newProduct.id)) {
          merged.push(newProduct);
        }
      });
      setSelectedProducts(merged);
    } catch (error) {
      console.error('Error validating SKUs:', error);
      alert('Error: Error validating SKUs: ' + error.message);
    } finally {
      setValidating(false);
    }
  };

  const handleSave = () => {
    const productIds = selectedProducts.map(p => p.id);
    onSelect(productIds);
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>Select Products</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'search' ? '2px solid #1976d2' : '2px solid transparent',
                color: activeTab === 'search' ? '#1976d2' : '#666',
                cursor: 'pointer',
                fontWeight: activeTab === 'search' ? '600' : '400'
              }}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bulk')}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'bulk' ? '2px solid #1976d2' : '2px solid transparent',
                color: activeTab === 'bulk' ? '#1976d2' : '#666',
                cursor: 'pointer',
                fontWeight: activeTab === 'bulk' ? '600' : '400'
              }}
            >
              Bulk Paste
            </button>
          </div>

          {activeTab === 'search' && (
            <div>
              <div className="form-group">
                <label>Search by SKU</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Type SKU to search..."
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSearch}
                    disabled={searching}
                  >
                    {searching ? 'Searching...' : '🔍 Search'}
                  </button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>Search Results</h4>
                  <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                    {searchResults.map((product) => (
                      <div
                        key={product.id}
                        style={{
                          padding: '12px',
                          borderBottom: '1px solid #f0f0f0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500 }}>{product.title}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>SKU: {product.sku}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleAddProduct(product)}
                          disabled={selectedProducts.find(p => p.id === product.id)}
                          style={{ padding: '6px 12px', fontSize: '14px' }}
                        >
                          {selectedProducts.find(p => p.id === product.id) ? 'Added' : 'Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'bulk' && (
            <div>
              <div className="form-group">
                <label>Paste SKUs (comma or line separated)</label>
                <textarea
                  value={bulkSkus}
                  onChange={(e) => setBulkSkus(e.target.value)}
                  placeholder="SKU001, SKU002, SKU003&#10;SKU004&#10;SKU005"
                  rows={6}
                  style={{ width: '100%', padding: '8px', fontFamily: 'monospace', fontSize: '14px' }}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleValidateBulkSkus}
                disabled={validating || !bulkSkus.trim()}
              >
                {validating ? 'Validating...' : 'Validate SKUs'}
              </button>

              {validatedProducts.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                    ✅ {validatedProducts.length} valid product(s) found
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Products have been added to selection below
                  </div>
                </div>
              )}

              {invalidSkus.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#ffebee', borderRadius: '4px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px', color: '#d32f2f' }}>
                    ❌ {invalidSkus.length} invalid SKU(s)
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {invalidSkus.join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>
            Selected Products ({selectedProducts.length})
          </h3>
          {selectedProducts.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
              No products selected. Use Search or Bulk Paste to add products.
            </div>
          ) : (
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              {selectedProducts.map((product) => (
                <div
                  key={product.id}
                  style={{
                    padding: '12px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{product.title}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>SKU: {product.sku}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveProduct(product.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#d32f2f',
                      cursor: 'pointer',
                      fontSize: '18px',
                      padding: '0 8px'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={selectedProducts.length === 0}>
            Save Selection ({selectedProducts.length})
          </button>
        </div>
      </div>
    </div>
  );
}

// Make available globally
window.ProductSelector = ProductSelector;

