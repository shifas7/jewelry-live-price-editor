const { useState, useEffect } = React;

function DashboardTab({ metalPrices, handleMetalPriceChange, handleUpdateMetalPrices, handleRefreshPrices, showSuccess, loading, stonePrices, setShowStoneModal, setSelectedStone, loadStonePrices, deleteStonePricing }) {
    const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, stone: null });

    const handleDeleteStone = (stone) => {
        setDeleteConfirm({ isOpen: true, stone });
    };

    const confirmDeleteStone = async () => {
        if (!deleteConfirm.stone) return;
        
        try {
            await deleteStonePricing(deleteConfirm.stone.id);
            alert('Stone pricing deleted successfully!');
            loadStonePrices();
        } catch (error) {
            console.error('Error deleting stone:', error);
            alert('Error: Error deleting stone pricing: ' + error.message);
        } finally {
            setDeleteConfirm({ isOpen: false, stone: null });
        }
    };

    return (
        <>
            <div className="card">
                <h2>METAL PRICES</h2>
                <p style={{fontSize: '14px', color: '#6d7175', marginBottom: '16px'}}>
                    Enter the latest metal prices to calculate and update the product prices.
                </p>

                {showSuccess && (
                    <div className="success-message">
                        ✓ Metal prices saved successfully! Click "Refresh Prices" to update all products.
                    </div>
                )}

                <div className="form-grid">
                    <div className="form-group">
                        <label>Gold Price 24K / Gram *</label>
                        <div className="input-suffix" data-suffix="INR">
                            <input
                                type="number"
                                value={metalPrices.gold24kt}
                                onChange={(e) => handleMetalPriceChange('gold24kt', e.target.value)}
                                placeholder="11869.00"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Gold Price 22K / Gram</label>
                        <div className="input-suffix" data-suffix="INR">
                            <input
                                type="number"
                                value={metalPrices.gold22kt}
                                onChange={(e) => handleMetalPriceChange('gold22kt', e.target.value)}
                                placeholder="10820"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Gold Price 18K / Gram</label>
                        <div className="input-suffix" data-suffix="INR">
                            <input
                                type="number"
                                value={metalPrices.gold18kt}
                                onChange={(e) => handleMetalPriceChange('gold18kt', e.target.value)}
                                placeholder="9900"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Gold Price 14K / Gram</label>
                        <div className="input-suffix" data-suffix="INR">
                            <input
                                type="number"
                                value={metalPrices.gold14kt}
                                onChange={(e) => handleMetalPriceChange('gold14kt', e.target.value)}
                                placeholder="6923.66"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Silver Price / Gram</label>
                        <div className="input-suffix" data-suffix="INR">
                            <input
                                type="number"
                                value={metalPrices.silver}
                                onChange={(e) => handleMetalPriceChange('silver', e.target.value)}
                                placeholder="158"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Platinum Price / Gram</label>
                        <div className="input-suffix" data-suffix="INR">
                            <input
                                type="number"
                                value={metalPrices.platinum}
                                onChange={(e) => handleMetalPriceChange('platinum', e.target.value)}
                                placeholder="5500"
                            />
                        </div>
                    </div>
                </div>

                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '12px'}}>
                    <button 
                        className="btn btn-secondary"
                        onClick={handleUpdateMetalPrices}
                        disabled={loading}
                    >
                        💾 Save Metal Prices
                    </button>
                    <button 
                        className="btn btn-primary btn-icon"
                        onClick={handleRefreshPrices}
                        disabled={loading}
                    >
                        🔄 Refresh Prices
                    </button>
                </div>
            </div>

            <div className="card">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <h2>STONE PRICES</h2>
                    <button 
                        className="btn btn-secondary"
                        onClick={() => {
                            setSelectedStone(null);
                            setShowStoneModal(true);
                        }}
                    >
                        + Add Stone Pricing
                    </button>
                </div>

                <table className="stone-table">
                    <thead>
                        <tr>
                            <th>Stone ID</th>
                            <th>Stone Type</th>
                            <th>Slabs</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stonePrices.map((stone, idx) => (
                            <tr key={idx}>
                                <td>{stone.stone_id}</td>
                                <td><span className="badge badge-success">{stone.stone_type}</span></td>
                                <td>{stone.slabs ? `${stone.slabs.length} Slabs` : '0 Slabs'}</td>
                                <td>
                                    <button 
                                        className="link-button"
                                        onClick={() => {
                                            setSelectedStone(stone);
                                            setShowStoneModal(true);
                                        }}
                                        style={{marginRight: '12px'}}
                                    >
                                        Edit
                                    </button>
                                    <button 
                                        className="link-button"
                                        onClick={() => handleDeleteStone(stone)}
                                        style={{color: '#d72c0d'}}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {stonePrices.length === 0 && (
                            <tr>
                                <td colSpan="4" style={{textAlign: 'center', color: '#6d7175'}}>
                                    No stone pricing configured yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm.isOpen && deleteConfirm.stone && window.ConfirmModal && (
                <window.ConfirmModal
                    isOpen={deleteConfirm.isOpen}
                    title="Delete Stone Pricing"
                    message={`Delete stone pricing for ${deleteConfirm.stone.stone_type} (ID: ${deleteConfirm.stone.stone_id})?`}
                    onConfirm={confirmDeleteStone}
                    onCancel={() => setDeleteConfirm({ isOpen: false, stone: null })}
                    confirmText="Delete"
                    cancelText="Cancel"
                    confirmButtonClass="btn-secondary"
                />
            )}
        </>
    );
}

// Make available globally
window.DashboardTab = DashboardTab;

