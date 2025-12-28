const { useState } = React;

function ConflictResolutionModal({ conflicts, discount, onResolve, onCancel }) {
  const [resolutions, setResolutions] = useState(
    conflicts.map(conflict => ({
      productId: conflict.productId,
      productTitle: conflict.productTitle,
      productSku: conflict.productSku,
      action: 'replace' // default action
    }))
  );
  const [resolving, setResolving] = useState(false);

  const handleActionChange = (productId, action) => {
    setResolutions(prev =>
      prev.map(r => r.productId === productId ? { ...r, action } : r)
    );
  };

  const handleResolve = async () => {
    try {
      setResolving(true);
      // Resolve each conflict individually
      for (const resolution of resolutions) {
        await API.resolveConflict({
          productId: resolution.productId,
          discountId: discount.id,
          action: resolution.action
        });
      }
      onResolve(resolutions);
    } catch (error) {
      console.error('Error resolving conflicts:', error);
      alert('Error: Error resolving conflicts: ' + error.message);
    } finally {
      setResolving(false);
    }
  };

  const getConflictInfo = (productId) => {
    return conflicts.find(c => c.productId === productId);
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>Discount Conflicts Detected</h2>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ padding: '12px', backgroundColor: '#fff3cd', borderRadius: '8px', marginBottom: '16px', border: '1px solid #ffc107' }}>
            <div style={{ fontSize: '14px', color: '#856404' }}>
              ⚠️ The following products already have discounts applied. Choose how to handle each conflict.
            </div>
          </div>

          {conflicts.map((conflict, index) => {
            const resolution = resolutions.find(r => r.productId === conflict.productId);
            return (
              <div
                key={conflict.productId}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px',
                  backgroundColor: '#fafafa'
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                    {conflict.productTitle}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    SKU: {conflict.productSku}
                  </div>
                </div>

                <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#fff', borderRadius: '4px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Existing Discount:</div>
                  <div style={{ fontWeight: 500 }}>
                    {conflict.existingDiscount.discountTitle}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Amount: ₹{conflict.existingDiscount.discountAmount.toFixed(2)}
                  </div>
                </div>

                <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>New Discount:</div>
                  <div style={{ fontWeight: 500 }}>
                    {conflict.newDiscount.discountTitle}
                  </div>
                </div>

                <div className="form-group">
                  <label>Action *</label>
                  <select
                    value={resolution.action}
                    onChange={(e) => handleActionChange(conflict.productId, e.target.value)}
                  >
                    <option value="replace">Replace existing discount</option>
                    <option value="keep_existing">Keep existing discount</option>
                    <option value="skip">Skip this product</option>
                  </select>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    {resolution.action === 'replace' && 'New discount will replace the existing one'}
                    {resolution.action === 'keep_existing' && 'Existing discount will be kept, new discount ignored'}
                    {resolution.action === 'skip' && 'This product will be skipped, no discount applied'}
                  </div>
                </div>

                {index < conflicts.length - 1 && (
                  <div style={{ borderTop: '1px solid #e0e0e0', marginTop: '16px', paddingTop: '16px' }}></div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={resolving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleResolve} disabled={resolving}>
            {resolving ? 'Resolving...' : 'Apply All Actions'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Make available globally
window.ConflictResolutionModal = ConflictResolutionModal;

