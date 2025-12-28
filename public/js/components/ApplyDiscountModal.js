const { useState, useEffect } = React;

function ApplyDiscountModal({ productIds, products, onClose, onApply }) {
  const [applying, setApplying] = useState(false);
  const [applyConfirm, setApplyConfirm] = useState(false);
  const [discountConfig, setDiscountConfig] = useState({
    gold: { enabled: false, discountValue: '' },
    diamond: { enabled: false, discountValue: '' },
    silver: { enabled: false, weightSlabs: [] }
  });

  const API = window.API || {};
  const showToast = window.showToast || { success: () => {}, error: () => {}, warning: () => {} };

  // Detect product types
  const detectProductTypes = () => {
    const types = { gold: 0, diamond: 0, silver: 0, unknown: 0 };
    
    products.forEach(product => {
      const config = product.configuration;
      if (!config || !config.configured) {
        types.unknown++;
        return;
      }

      // Check for diamond stones
      const stones = config.stones || [];
      const hasDiamond = stones.some(stone => {
        const stoneType = stone.stoneType?.toLowerCase() || '';
        return stoneType.includes('diamond');
      });

      if (hasDiamond) {
        types.diamond++;
      } else if (config.metal_type?.toLowerCase().includes('silver')) {
        types.silver++;
      } else {
        types.gold++;
      }
    });

    return types;
  };

  const productTypes = detectProductTypes();
  const hasMixedTypes = Object.values(productTypes).filter(count => count > 0).length > 1;

  const handleAddSlab = () => {
    setDiscountConfig({
      ...discountConfig,
      silver: {
        ...discountConfig.silver,
        weightSlabs: [
          ...discountConfig.silver.weightSlabs,
          { fromWeight: '', toWeight: '', discountAmount: '' }
        ]
      }
    });
  };

  const handleRemoveSlab = (index) => {
    const newSlabs = discountConfig.silver.weightSlabs.filter((_, i) => i !== index);
    setDiscountConfig({
      ...discountConfig,
      silver: { ...discountConfig.silver, weightSlabs: newSlabs }
    });
  };

  const handleSlabChange = (index, field, value) => {
    const newSlabs = [...discountConfig.silver.weightSlabs];
    newSlabs[index] = { ...newSlabs[index], [field]: value };
    setDiscountConfig({
      ...discountConfig,
      silver: { ...discountConfig.silver, weightSlabs: newSlabs }
    });
  };

  const validate = () => {
    if (productTypes.gold > 0 && discountConfig.gold.enabled) {
      if (!discountConfig.gold.discountValue || isNaN(discountConfig.gold.discountValue)) {
        alert('Error: Please enter a valid percentage for Gold products');
        return false;
      }
      if (parseFloat(discountConfig.gold.discountValue) < 0 || parseFloat(discountConfig.gold.discountValue) > 100) {
        alert('Error: Gold discount percentage must be between 0 and 100');
        return false;
      }
    }

    if (productTypes.diamond > 0 && discountConfig.diamond.enabled) {
      if (!discountConfig.diamond.discountValue || isNaN(discountConfig.diamond.discountValue)) {
        alert('Error: Please enter a valid amount for Diamond products');
        return false;
      }
      if (parseFloat(discountConfig.diamond.discountValue) < 0) {
        alert('Error: Diamond discount amount must be positive');
        return false;
      }
    }

    if (productTypes.silver > 0 && discountConfig.silver.enabled) {
      if (discountConfig.silver.weightSlabs.length === 0) {
        alert('Error: Please add at least one weight slab for Silver products');
        return false;
      }
      for (let i = 0; i < discountConfig.silver.weightSlabs.length; i++) {
        const slab = discountConfig.silver.weightSlabs[i];
        if (!slab.fromWeight || !slab.toWeight || !slab.discountAmount) {
          alert(`Error: Slab ${i + 1}: All fields are required`);
          return false;
        }
        if (parseFloat(slab.fromWeight) > parseFloat(slab.toWeight)) {
          alert(`Error: Slab ${i + 1}: From weight cannot be greater than To weight`);
          return false;
        }
      }
    }

    // Check if at least one discount is enabled
    const anyEnabled = discountConfig.gold.enabled || discountConfig.diamond.enabled || discountConfig.silver.enabled;
    if (!anyEnabled) {
      alert('Error: Please enable at least one discount type');
      return false;
    }

    return true;
  };

  const handleApply = async () => {
    if (!validate()) {
      return;
    }

    setApplyConfirm(true);
  };

  const confirmApply = async () => {
    setApplyConfirm(false);
    
    try {
      setApplying(true);

      // Apply discounts based on product types
      const results = [];

      for (const productId of productIds) {
        const product = products.find(p => p.id === productId);
        if (!product || !product.configuration?.configured) {
          continue;
        }

        // Detect product type for this product
        const config = product.configuration;
        const stones = config.stones || [];
        const hasDiamond = stones.some(s => s.stoneType?.toLowerCase().includes('diamond'));
        
        let productType = 'gold';
        let discount = null;

        if (hasDiamond) {
          productType = 'diamond';
          if (discountConfig.diamond.enabled) {
            discount = {
              enabled: true,
              discountType: 'fixed',
              discountValue: parseFloat(discountConfig.diamond.discountValue)
            };
          }
        } else if (config.metal_type?.toLowerCase().includes('silver')) {
          productType = 'silver';
          if (discountConfig.silver.enabled) {
            discount = {
              enabled: true,
              discountType: 'slab',
              weightSlabs: discountConfig.silver.weightSlabs.map(slab => ({
                fromWeight: parseFloat(slab.fromWeight),
                toWeight: parseFloat(slab.toWeight),
                discountAmount: parseFloat(slab.discountAmount)
              }))
            };
          }
        } else {
          productType = 'gold';
          if (discountConfig.gold.enabled) {
            discount = {
              enabled: true,
              discountType: 'percentage',
              discountValue: parseFloat(discountConfig.gold.discountValue)
            };
          }
        }

        if (discount) {
          results.push({ productId, discount });
        }
      }

      // Apply discounts to products
      if (results.length > 0) {
        const bulkResults = await Promise.all(
          results.map(({ productId, discount }) =>
            API.applyBulkDiscount([productId], discount)
          )
        );
        
        const successCount = bulkResults.filter(r => r.success).length;
        alert(`Applied discount to ${successCount} out of ${results.length} product(s)`);
      } else {
        alert('Warning: No discounts were applied. Please enable discounts for the selected product types.');
      }

      onApply();
    } catch (error) {
      console.error('Error applying discount:', error);
      alert('Error: Error applying discount: ' + error.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>Apply Discount to Selected Products</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <div style={{ fontWeight: 500, marginBottom: '8px' }}>
              Selected Products: {productIds.length}
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {productTypes.gold > 0 && <div>• Gold Products: {productTypes.gold}</div>}
              {productTypes.diamond > 0 && <div>• Diamond Products: {productTypes.diamond}</div>}
              {productTypes.silver > 0 && <div>• Silver Products: {productTypes.silver}</div>}
              {productTypes.unknown > 0 && (
                <div style={{ color: '#d32f2f' }}>
                  • Unconfigured Products: {productTypes.unknown} (will be skipped)
                </div>
              )}
            </div>
          </div>

          {hasMixedTypes && (
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
              <div style={{ fontSize: '14px', color: '#856404' }}>
                ⚠️ You have selected products of different types. Configure discounts for each type below.
              </div>
            </div>
          )}

          {/* Gold Product Discount */}
          {productTypes.gold > 0 && (
            <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  checked={discountConfig.gold.enabled}
                  onChange={(e) => setDiscountConfig({
                    ...discountConfig,
                    gold: { ...discountConfig.gold, enabled: e.target.checked }
                  })}
                  style={{ marginRight: '8px', cursor: 'pointer' }}
                />
                <h3 style={{ margin: 0, fontSize: '16px' }}>
                  Gold Products ({productTypes.gold}) - Discount on Making Charge
                </h3>
              </div>

              {discountConfig.gold.enabled && (
                <div className="form-group">
                  <label>Discount Percentage</label>
                  <div className="input-suffix" data-suffix="%">
                    <input
                      type="number"
                      step="0.1"
                      value={discountConfig.gold.discountValue}
                      onChange={(e) => setDiscountConfig({
                        ...discountConfig,
                        gold: { ...discountConfig.gold, discountValue: e.target.value }
                      })}
                      placeholder="e.g., 10"
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    This percentage will be applied to the making charge
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diamond Product Discount */}
          {productTypes.diamond > 0 && (
            <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  checked={discountConfig.diamond.enabled}
                  onChange={(e) => setDiscountConfig({
                    ...discountConfig,
                    diamond: { ...discountConfig.diamond, enabled: e.target.checked }
                  })}
                  style={{ marginRight: '8px', cursor: 'pointer' }}
                />
                <h3 style={{ margin: 0, fontSize: '16px' }}>
                  Diamond Products ({productTypes.diamond}) - Discount on Stone Cost
                </h3>
              </div>

              {discountConfig.diamond.enabled && (
                <div className="form-group">
                  <label>Discount Amount</label>
                  <div className="input-suffix" data-suffix="₹">
                    <input
                      type="number"
                      step="0.01"
                      value={discountConfig.diamond.discountValue}
                      onChange={(e) => setDiscountConfig({
                        ...discountConfig,
                        diamond: { ...discountConfig.diamond, discountValue: e.target.value }
                      })}
                      placeholder="e.g., 1000"
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    Fixed amount discount on total stone cost
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Silver Product Discount */}
          {productTypes.silver > 0 && (
            <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  checked={discountConfig.silver.enabled}
                  onChange={(e) => setDiscountConfig({
                    ...discountConfig,
                    silver: { ...discountConfig.silver, enabled: e.target.checked }
                  })}
                  style={{ marginRight: '8px', cursor: 'pointer' }}
                />
                <h3 style={{ margin: 0, fontSize: '16px' }}>
                  Silver Products ({productTypes.silver}) - Weight-based Slabs
                </h3>
              </div>

              {discountConfig.silver.enabled && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '14px', color: '#666' }}>
                      Configure weight-based discount slabs
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleAddSlab}
                      style={{ padding: '6px 12px', fontSize: '14px' }}
                    >
                      + Add Slab
                    </button>
                  </div>

                  {discountConfig.silver.weightSlabs.length === 0 && (
                    <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', color: '#666', fontSize: '14px' }}>
                      No slabs added. Click "Add Slab" to create weight-based discounts.
                    </div>
                  )}

                  {discountConfig.silver.weightSlabs.map((slab, index) => (
                    <div
                      key={index}
                      style={{
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '12px',
                        backgroundColor: '#fafafa'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                          Slab {index + 1}
                        </h4>
                        <button
                          type="button"
                          onClick={() => handleRemoveSlab(index)}
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

                      <div className="form-grid">
                        <div className="form-group">
                          <label>From Weight (g)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={slab.fromWeight}
                            onChange={(e) => handleSlabChange(index, 'fromWeight', e.target.value)}
                            placeholder="e.g., 5"
                          />
                        </div>

                        <div className="form-group">
                          <label>To Weight (g)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={slab.toWeight}
                            onChange={(e) => handleSlabChange(index, 'toWeight', e.target.value)}
                            placeholder="e.g., 10"
                          />
                        </div>

                        <div className="form-group">
                          <label>Discount Amount (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={slab.discountAmount}
                            onChange={(e) => handleSlabChange(index, 'discountAmount', e.target.value)}
                            placeholder="e.g., 1000"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={applying}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
            {applying ? 'Applying...' : 'Apply Discount'}
          </button>
        </div>
      </div>

      {/* Apply Confirmation Modal */}
      {applyConfirm && window.ConfirmModal && (
        <window.ConfirmModal
          isOpen={applyConfirm}
          title="Apply Discount"
          message={`Apply discount to ${productIds.length} product(s)?`}
          onConfirm={confirmApply}
          onCancel={() => setApplyConfirm(false)}
          confirmText="Apply"
          cancelText="Cancel"
        />
      )}
    </div>
  );
}

// Make available globally
window.ApplyDiscountModal = ApplyDiscountModal;

