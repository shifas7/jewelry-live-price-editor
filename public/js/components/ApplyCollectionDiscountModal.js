const { useState } = React;

function ApplyCollectionDiscountModal({ discount, collections, onClose, onApply }) {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyConfirm, setApplyConfirm] = useState(false);

  const API = window.API || {};

  const handleApply = () => {
    if (!selectedCollection) {
      alert('Error: Please select a collection');
      return;
    }

    setApplyConfirm(true);
  };

  const confirmApply = async () => {
    setApplyConfirm(false);

    try {
      setApplying(true);

      // Build discount configuration
      const discountConfig = {
        enabled: true,
        discountType: discount.discount_type,
        discountValue: discount.discount_value,
        weightSlabs: discount.weight_slabs || [],
        ruleId: discount.id,
        ruleName: discount.rule_name
      };

      const result = await API.applyCollectionDiscount(selectedCollection, discountConfig);
      alert(result.message);
      onApply();
    } catch (error) {
      console.error('Error applying discount:', error);
      alert('Error: Error applying discount: ' + error.message);
    } finally {
      setApplying(false);
    }
  };

  const getDiscountDisplay = () => {
    if (discount.product_type === 'gold') {
      return `${discount.discount_value}% off on Making Charge`;
    } else if (discount.product_type === 'diamond') {
      return `₹${discount.discount_value} off on Stone Cost`;
    } else if (discount.product_type === 'silver') {
      return `Weight-based slabs (${discount.weight_slabs?.length || 0} slabs)`;
    }
    return '-';
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Apply Discount to Collection</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <div style={{ fontWeight: 500, marginBottom: '4px' }}>
              {discount.rule_name}
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {getDiscountDisplay()}
            </div>
          </div>

          <div className="form-group">
            <label>Select Collection *</label>
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              disabled={applying}
            >
              <option value="">-- Select a collection --</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.title} ({collection.productsCount} products)
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            This will apply the discount to all products in the selected collection.
            The discount will be saved to each product's configuration.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={applying}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
            {applying ? 'Applying...' : 'Apply to Collection'}
          </button>
        </div>
      </div>

      {/* Apply Confirmation Modal */}
      {applyConfirm && window.ConfirmModal && (
        <window.ConfirmModal
          isOpen={applyConfirm}
          title="Apply Discount to Collection"
          message={`Apply discount "${discount.rule_name}" to all products in the selected collection?`}
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
window.ApplyCollectionDiscountModal = ApplyCollectionDiscountModal;

