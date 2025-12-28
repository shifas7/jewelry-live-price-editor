const { useState, useEffect } = React;

function DiscountsTab({ discounts, loading, onRefresh, collections }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, ruleId: null });

  const API = window.API || {};

  const handleDelete = (ruleId) => {
    setDeleteConfirm({ isOpen: true, ruleId });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.ruleId) return;

    try {
      await API.deleteDiscount(deleteConfirm.ruleId);
      alert('Discount deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting discount:', error);
      alert('Error: Error deleting discount: ' + error.message);
    } finally {
      setDeleteConfirm({ isOpen: false, ruleId: null });
    }
  };

  const handleEdit = (discount) => {
    setEditingDiscount(discount);
    setShowCreateModal(true);
  };

  const getRulesDisplay = (discount) => {
    const rules = [];
    
    // Check if new unified format or old format
    if (discount.gold_rules || discount.diamond_rules || discount.silver_rules) {
      // New unified format
      if (discount.gold_rules?.enabled) {
        rules.push(`Gold: ${discount.gold_rules.discount_percentage}%`);
      }
      if (discount.diamond_rules?.enabled) {
        rules.push(`Diamond: ₹${discount.diamond_rules.discount_amount}`);
      }
      if (discount.silver_rules?.enabled) {
        const slabCount = discount.silver_rules.weight_slabs?.length || 0;
        rules.push(`Silver: ${slabCount} slab${slabCount !== 1 ? 's' : ''}`);
      }
    } else {
      // Old format (backward compatibility)
      if (discount.product_type === 'gold') {
        rules.push(`Gold: ${discount.discount_value}%`);
      } else if (discount.product_type === 'diamond') {
        rules.push(`Diamond: ₹${discount.discount_value}`);
      } else if (discount.product_type === 'silver') {
        const slabCount = discount.weight_slabs?.length || 0;
        rules.push(`Silver: ${slabCount} slab${slabCount !== 1 ? 's' : ''}`);
      }
    }
    
    return rules.join(', ') || 'No rules';
  };

  const getApplicationDisplay = (discount) => {
    if (discount.application_type === 'collection') {
      const collection = collections.find(c => c.id === discount.target_collection_id);
      return collection 
        ? `Collection: ${collection.title} (${collection.productsCount} products)`
        : `Collection: ${discount.target_collection_id}`;
    } else if (discount.application_type === 'products') {
      const count = discount.target_product_ids?.length || 0;
      return `Products: ${count} selected`;
    } else {
      // Old format
      return 'N/A';
    }
  };

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h2>Discounts</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingDiscount(null);
            setShowCreateModal(true);
          }}
        >
          + Create Discount
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading discounts...</div>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Discount Title</th>
              <th>Applies To</th>
              <th>Rules</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {discounts.map((discount, idx) => (
              <tr key={idx}>
                <td>
                  <div style={{ fontWeight: 500 }}>
                    {discount.discount_title || discount.rule_name || 'Untitled Discount'}
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: '14px' }}>
                    {getApplicationDisplay(discount)}
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: '14px' }}>
                    {getRulesDisplay(discount)}
                  </div>
                </td>
                <td>
                  <span
                    className={`badge ${
                      discount.is_active ? 'badge-success' : 'badge-pending'
                    }`}
                  >
                    {discount.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="link-button"
                      onClick={() => handleEdit(discount)}
                    >
                      Edit
                    </button>
                    <button
                      className="link-button"
                      style={{ color: '#d32f2f' }}
                      onClick={() => handleDelete(discount.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {discounts.length === 0 && (
              <tr>
                <td
                  colSpan="5"
                  style={{ textAlign: 'center', color: '#6d7175' }}
                >
                  No discounts found. Create one to get started!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showCreateModal && (
        <window.DiscountFormModal
          discount={editingDiscount}
          collections={collections}
          onClose={() => {
            setShowCreateModal(false);
            setEditingDiscount(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingDiscount(null);
            onRefresh();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && window.ConfirmModal && (
        <window.ConfirmModal
          isOpen={deleteConfirm.isOpen}
          title="Delete Discount"
          message="Are you sure you want to delete this discount? This will remove discounts from all target products."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm({ isOpen: false, ruleId: null })}
          confirmText="Delete"
          cancelText="Cancel"
          confirmButtonClass="btn-secondary"
        />
      )}
    </div>
  );
}

// Make available globally
window.DiscountsTab = DiscountsTab;

