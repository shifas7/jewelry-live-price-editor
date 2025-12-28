const { useState, useEffect } = React;

function DiscountModal({ discount, onClose, onSave }) {
  const isEdit = !!discount;
  const API = window.API || {};

  const [formData, setFormData] = useState({
    ruleName: discount?.rule_name || '',
    productType: discount?.product_type || 'gold',
    discountType: discount?.discount_type || 'percentage',
    discountValue: discount?.discount_value || '',
    weightSlabs: discount?.weight_slabs || [],
    isActive: discount?.is_active !== undefined ? discount.is_active : true
  });

  const [errors, setErrors] = useState({});

  const handleProductTypeChange = (type) => {
    // Reset discount configuration when product type changes
    let discountType = 'percentage';
    if (type === 'diamond') discountType = 'fixed';
    if (type === 'silver') discountType = 'slab';

    setFormData({
      ...formData,
      productType: type,
      discountType,
      discountValue: '',
      weightSlabs: []
    });
  };

  const handleAddSlab = () => {
    setFormData({
      ...formData,
      weightSlabs: [
        ...formData.weightSlabs,
        { fromWeight: '', toWeight: '', discountAmount: '' }
      ]
    });
  };

  const handleRemoveSlab = (index) => {
    const newSlabs = formData.weightSlabs.filter((_, i) => i !== index);
    setFormData({ ...formData, weightSlabs: newSlabs });
  };

  const handleSlabChange = (index, field, value) => {
    const newSlabs = [...formData.weightSlabs];
    newSlabs[index] = { ...newSlabs[index], [field]: value };
    setFormData({ ...formData, weightSlabs: newSlabs });
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.ruleName.trim()) {
      newErrors.ruleName = 'Rule name is required';
    }

    if (formData.productType === 'gold') {
      if (!formData.discountValue || isNaN(formData.discountValue)) {
        newErrors.discountValue = 'Valid percentage is required';
      } else if (parseFloat(formData.discountValue) < 0 || parseFloat(formData.discountValue) > 100) {
        newErrors.discountValue = 'Percentage must be between 0 and 100';
      }
    } else if (formData.productType === 'diamond') {
      if (!formData.discountValue || isNaN(formData.discountValue)) {
        newErrors.discountValue = 'Valid amount is required';
      } else if (parseFloat(formData.discountValue) < 0) {
        newErrors.discountValue = 'Amount must be positive';
      }
    } else if (formData.productType === 'silver') {
      if (formData.weightSlabs.length === 0) {
        newErrors.weightSlabs = 'At least one weight slab is required';
      } else {
        formData.weightSlabs.forEach((slab, index) => {
          if (!slab.fromWeight || !slab.toWeight || !slab.discountAmount) {
            newErrors.weightSlabs = 'All slab fields are required';
          } else if (parseFloat(slab.fromWeight) > parseFloat(slab.toWeight)) {
            newErrors.weightSlabs = `Slab ${index + 1}: From weight cannot be greater than To weight`;
          }
        });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    try {
      if (isEdit) {
        await API.updateDiscount(discount.id, formData);
        alert('Discount rule updated successfully!');
      } else {
        await API.createDiscount(formData);
        alert('Discount rule created successfully!');
      }
      onSave();
    } catch (error) {
      console.error('Error saving discount:', error);
      alert('Error: Error saving discount: ' + error.message);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Discount Rule' : 'Create Discount Rule'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Rule Name *</label>
              <input
                type="text"
                value={formData.ruleName}
                onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })}
                placeholder="e.g., Gold 10% Off Making"
              />
              {errors.ruleName && (
                <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                  {errors.ruleName}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Product Type *</label>
              <select
                value={formData.productType}
                onChange={(e) => handleProductTypeChange(e.target.value)}
              >
                <option value="gold">Gold Products</option>
                <option value="diamond">Diamond Products</option>
                <option value="silver">Silver Products</option>
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select
                value={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          {/* Gold Discount Configuration */}
          {formData.productType === 'gold' && (
            <div style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>
                Discount on Making Charge
              </h3>
              <div className="form-group">
                <label>Discount Percentage *</label>
                <div className="input-suffix" data-suffix="%">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder="e.g., 10"
                  />
                </div>
                {errors.discountValue && (
                  <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                    {errors.discountValue}
                  </div>
                )}
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  This percentage will be applied to the making charge
                </div>
              </div>
            </div>
          )}

          {/* Diamond Discount Configuration */}
          {formData.productType === 'diamond' && (
            <div style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>
                Discount on Stone Cost
              </h3>
              <div className="form-group">
                <label>Discount Amount *</label>
                <div className="input-suffix" data-suffix="₹">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder="e.g., 1000"
                  />
                </div>
                {errors.discountValue && (
                  <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                    {errors.discountValue}
                  </div>
                )}
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Fixed amount discount on total stone cost
                </div>
              </div>
            </div>
          )}

          {/* Silver Discount Configuration */}
          {formData.productType === 'silver' && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', margin: 0 }}>
                  Weight-based Slabs
                </h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAddSlab}
                  style={{ padding: '6px 12px', fontSize: '14px' }}
                >
                  + Add Slab
                </button>
              </div>

              {errors.weightSlabs && (
                <div style={{ color: '#d32f2f', fontSize: '12px', marginBottom: '12px' }}>
                  {errors.weightSlabs}
                </div>
              )}

              {formData.weightSlabs.length === 0 && (
                <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', color: '#666', fontSize: '14px' }}>
                  No slabs added. Click "Add Slab" to create weight-based discounts.
                </div>
              )}

              {formData.weightSlabs.map((slab, index) => (
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Make available globally
window.DiscountModal = DiscountModal;

