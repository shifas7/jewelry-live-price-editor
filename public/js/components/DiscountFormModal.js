const { useState, useEffect } = React;

function DiscountFormModal({ discount, onClose, onSave, collections }) {
  const isEdit = !!discount;
  const API = window.API || {};

  const [formData, setFormData] = useState({
    discount_title: discount?.discount_title || '',
    application_type: discount?.application_type || 'products',
    target_collection_id: discount?.target_collection_id || '',
    target_product_ids: discount?.target_product_ids || [],
    gold_rules: discount?.gold_rules || { enabled: true, discount_percentage: '' },
    diamond_rules: discount?.diamond_rules || { enabled: true, discount_amount: '' },
    silver_rules: discount?.silver_rules || { enabled: true, weight_slabs: [] },
    is_active: discount?.is_active !== undefined ? discount.is_active : true
  });

  const [errors, setErrors] = useState({});
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState(null);

  const handleApplicationTypeChange = (type) => {
    setFormData({
      ...formData,
      application_type: type,
      target_collection_id: type === 'collection' ? formData.target_collection_id : '',
      target_product_ids: type === 'products' ? formData.target_product_ids : []
    });
  };

  const handleAddSlab = () => {
    setFormData({
      ...formData,
      silver_rules: {
        ...formData.silver_rules,
        weight_slabs: [
          ...formData.silver_rules.weight_slabs,
          { from: '', to: '', amount: '' }
        ]
      }
    });
  };

  const handleRemoveSlab = (index) => {
    const newSlabs = formData.silver_rules.weight_slabs.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      silver_rules: { ...formData.silver_rules, weight_slabs: newSlabs }
    });
  };

  const handleSlabChange = (index, field, value) => {
    const newSlabs = [...formData.silver_rules.weight_slabs];
    newSlabs[index] = { ...newSlabs[index], [field]: value };
    setFormData({
      ...formData,
      silver_rules: { ...formData.silver_rules, weight_slabs: newSlabs }
    });
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.discount_title.trim()) {
      newErrors.discount_title = 'Discount title is required';
    }

    if (formData.application_type === 'collection' && !formData.target_collection_id) {
      newErrors.target_collection_id = 'Please select a collection';
    }

    if (formData.application_type === 'products' && formData.target_product_ids.length === 0) {
      newErrors.target_product_ids = 'Please select at least one product';
    }

    // Validate Gold Rules
    if (!formData.gold_rules.enabled) {
      newErrors.gold_rules = 'Gold product rules must be enabled';
    } else {
      const goldPercent = parseFloat(formData.gold_rules.discount_percentage);
      if (isNaN(goldPercent)) {
        newErrors.gold_rules = 'Gold discount percentage is required';
      } else if (goldPercent < 0 || goldPercent > 100) {
        newErrors.gold_rules = 'Gold discount percentage must be between 0 and 100';
      }
    }

    // Validate Diamond Rules
    if (!formData.diamond_rules.enabled) {
      newErrors.diamond_rules = 'Diamond product rules must be enabled';
    } else {
      const diamondAmount = parseFloat(formData.diamond_rules.discount_amount);
      if (isNaN(diamondAmount)) {
        newErrors.diamond_rules = 'Diamond discount amount is required';
      } else if (diamondAmount < 0) {
        newErrors.diamond_rules = 'Diamond discount amount must be positive';
      }
    }

    // Validate Silver Rules
    if (!formData.silver_rules.enabled) {
      newErrors.silver_rules = 'Silver product rules must be enabled';
    } else {
      const slabs = formData.silver_rules.weight_slabs || [];
      if (slabs.length === 0) {
        newErrors.silver_rules = 'At least one weight slab is required for silver products';
      } else {
        slabs.forEach((slab, index) => {
          const from = parseFloat(slab.from);
          const to = parseFloat(slab.to);
          const amount = parseFloat(slab.amount);
          
          if (isNaN(from) || isNaN(to) || isNaN(amount)) {
            newErrors.silver_rules = `Slab ${index + 1}: All fields are required`;
          } else if (from > to) {
            newErrors.silver_rules = `Slab ${index + 1}: From weight cannot be greater than To weight`;
          } else if (amount < 0) {
            newErrors.silver_rules = `Slab ${index + 1}: Discount amount must be positive`;
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
      setSaving(true);
      
      const discountData = {
        discount_title: formData.discount_title.trim(),
        application_type: formData.application_type,
        target_collection_id: formData.application_type === 'collection' ? formData.target_collection_id : null,
        target_product_ids: formData.application_type === 'products' ? formData.target_product_ids : [],
        gold_rules: formData.gold_rules,
        diamond_rules: formData.diamond_rules,
        silver_rules: formData.silver_rules,
        is_active: formData.is_active
      };

      let result;
      if (isEdit) {
        result = await API.updateDiscount(discount.id, discountData);
      } else {
        result = await API.createDiscount(discountData);
      }

      if (result.hasConflicts) {
        setConflicts(result.conflicts);
        // Don't close modal - show conflicts
        return;
      }

      alert(result.message || 'Discount saved successfully!');
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving discount:', error);
      alert('Error: Error saving discount: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleProductsSelected = (productIds) => {
    setFormData({
      ...formData,
      target_product_ids: productIds
    });
    setShowProductSelector(false);
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Discount' : 'Create Discount'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {conflicts && (
          <window.ConflictResolutionModal
            conflicts={conflicts}
            discount={{ id: discount?.id, ...formData }}
            onResolve={async () => {
              alert('Conflicts resolved! Discount applied.');
              onSave();
              onClose();
            }}
            onCancel={() => setConflicts(null)}
          />
        )}

        {!conflicts && (
          <>
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Discount Title *</label>
                  <input
                    type="text"
                    value={formData.discount_title}
                    onChange={(e) => setFormData({ ...formData, discount_title: e.target.value })}
                    placeholder="e.g., Diwali Festival Sale"
                  />
                  {errors.discount_title && (
                    <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                      {errors.discount_title}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Apply To *</label>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="application_type"
                        value="collection"
                        checked={formData.application_type === 'collection'}
                        onChange={(e) => handleApplicationTypeChange('collection')}
                      />
                      Collection
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="application_type"
                        value="products"
                        checked={formData.application_type === 'products'}
                        onChange={(e) => handleApplicationTypeChange('products')}
                      />
                      Products
                    </label>
                  </div>
                </div>

                {formData.application_type === 'collection' && (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Select Collection *</label>
                    <select
                      value={formData.target_collection_id}
                      onChange={(e) => setFormData({ ...formData, target_collection_id: e.target.value })}
                    >
                      <option value="">-- Select a collection --</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.title} ({collection.productsCount} products)
                        </option>
                      ))}
                    </select>
                    {errors.target_collection_id && (
                      <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                        {errors.target_collection_id}
                      </div>
                    )}
                  </div>
                )}

                {formData.application_type === 'products' && (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Select Products *</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowProductSelector(true)}
                      >
                        {formData.target_product_ids.length > 0 
                          ? `Edit Selection (${formData.target_product_ids.length} products)`
                          : 'Select Products'}
                      </button>
                      {formData.target_product_ids.length > 0 && (
                        <span style={{ fontSize: '14px', color: '#666' }}>
                          {formData.target_product_ids.length} product(s) selected
                        </span>
                      )}
                    </div>
                    {errors.target_product_ids && (
                      <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                        {errors.target_product_ids}
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Gold Product Rules */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>
                Gold Product Rules (Required)
              </h3>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.gold_rules.enabled}
                    onChange={(e) => setFormData({
                      ...formData,
                      gold_rules: { ...formData.gold_rules, enabled: e.target.checked }
                    })}
                  />
                  Enable Gold Discount
                </label>
              </div>
              {formData.gold_rules.enabled && (
                <div className="form-group">
                  <label>Discount on Making Charge (Making + Labour + Wastage) *</label>
                  <div className="input-suffix" data-suffix="%">
                    <input
                      type="number"
                      step="0.1"
                      value={formData.gold_rules.discount_percentage}
                      onChange={(e) => setFormData({
                        ...formData,
                        gold_rules: { ...formData.gold_rules, discount_percentage: e.target.value }
                      })}
                      placeholder="e.g., 15"
                    />
                  </div>
                  {errors.gold_rules && (
                    <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                      {errors.gold_rules}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    Percentage applied to (Making Charge + Labour Charge + Wastage Charge)
                  </div>
                </div>
              )}
            </div>

            {/* Diamond Product Rules */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>
                Diamond Product Rules (Required)
              </h3>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.diamond_rules.enabled}
                    onChange={(e) => setFormData({
                      ...formData,
                      diamond_rules: { ...formData.diamond_rules, enabled: e.target.checked }
                    })}
                  />
                  Enable Diamond Discount
                </label>
              </div>
              {formData.diamond_rules.enabled && (
                <div className="form-group">
                  <label>Discount on Stone Cost *</label>
                  <div className="input-suffix" data-suffix="₹">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.diamond_rules.discount_amount}
                      onChange={(e) => setFormData({
                        ...formData,
                        diamond_rules: { ...formData.diamond_rules, discount_amount: e.target.value }
                      })}
                      placeholder="e.g., 2000"
                    />
                  </div>
                  {errors.diamond_rules && (
                    <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                      {errors.diamond_rules}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    Fixed amount discount on total stone cost
                  </div>
                </div>
              )}
            </div>

            {/* Silver Product Rules */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', margin: 0 }}>
                  Silver Product Rules (Required)
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
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.silver_rules.enabled}
                    onChange={(e) => setFormData({
                      ...formData,
                      silver_rules: { ...formData.silver_rules, enabled: e.target.checked }
                    })}
                  />
                  Enable Silver Discount
                </label>
              </div>
              {formData.silver_rules.enabled && (
                <div>
                  {formData.silver_rules.weight_slabs.length === 0 && (
                    <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', color: '#666', fontSize: '14px' }}>
                      No slabs added. Click "Add Slab" to create weight-based discounts.
                    </div>
                  )}

                  {formData.silver_rules.weight_slabs.map((slab, index) => (
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
                            value={slab.from}
                            onChange={(e) => handleSlabChange(index, 'from', e.target.value)}
                            placeholder="e.g., 0"
                          />
                        </div>

                        <div className="form-group">
                          <label>To Weight (g)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={slab.to}
                            onChange={(e) => handleSlabChange(index, 'to', e.target.value)}
                            placeholder="e.g., 20"
                          />
                        </div>

                        <div className="form-group">
                          <label>Discount Amount (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={slab.amount}
                            onChange={(e) => handleSlabChange(index, 'amount', e.target.value)}
                            placeholder="e.g., 500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {errors.silver_rules && (
                    <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '8px' }}>
                      {errors.silver_rules}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {!conflicts && (
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : (isEdit ? 'Update & Re-apply' : 'Save & Apply Discount')}
            </button>
          )}
        </div>
      </div>

      {showProductSelector && (
        <window.ProductSelector
          selectedProductIds={formData.target_product_ids}
          onSelect={handleProductsSelected}
          onClose={() => setShowProductSelector(false)}
        />
      )}
    </div>
  );
}

// Make available globally
window.DiscountFormModal = DiscountFormModal;

