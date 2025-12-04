const { useState, useEffect } = React;

function StoneModal({ stone, onClose, onSave, saveStonePricing }) {
    const [stoneData, setStoneData] = useState({
        stoneId: stone?.stone_id || '',
        stoneType: stone?.stone_type || 'Diamond',
        title: stone?.title || '',
        clarity: stone?.clarity || '',
        color: stone?.color || '',
        shape: stone?.shape || '',
        slabs: stone?.slabs || [{ fromWeight: '', toWeight: '', pricePerCarat: '' }]
    });

    const isEditing = !!stone;

    const addSlab = () => {
        setStoneData({
            ...stoneData,
            slabs: [...stoneData.slabs, { fromWeight: '', toWeight: '', pricePerCarat: '' }]
        });
    };

    const updateSlab = (index, field, value) => {
        const newSlabs = [...stoneData.slabs];
        newSlabs[index][field] = value;
        setStoneData({ ...stoneData, slabs: newSlabs });
    };

    const handleSave = async () => {
        try {
            // Include the stone ID if editing
            const dataToSave = {
                ...stoneData,
                ...(stone?.id && { id: stone.id }) // Add Shopify metaobject ID if editing
            };

            const data = await saveStonePricing(dataToSave);
            if (data.success) {
                alert(isEditing ? 'Stone pricing updated successfully!' : 'Stone pricing created successfully!');
                onSave();
                onClose();
            }
        } catch (error) {
            console.error('Error saving stone pricing:', error);
            alert('Error saving stone pricing');
        }
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>{isEditing ? 'Edit Stone Pricing' : 'Add Stone Pricing'}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="form-grid">
                    <div className="form-group">
                        <label>Stone ID *</label>
                        <input
                            type="text"
                            value={stoneData.stoneId}
                            onChange={(e) => setStoneData({...stoneData, stoneId: e.target.value})}
                            placeholder="VVS 1"
                        />
                    </div>

                    <div className="form-group">
                        <label>Title *</label>
                        <input
                            type="text"
                            value={stoneData.title}
                            onChange={(e) => setStoneData({...stoneData, title: e.target.value})}
                            placeholder="DIAMOND"
                        />
                    </div>

                    <div className="form-group">
                        <label>Stone Type *</label>
                        <input
                            type="text"
                            value={stoneData.stoneType}
                            onChange={(e) => setStoneData({...stoneData, stoneType: e.target.value})}
                            placeholder="Diamond"
                        />
                    </div>

                    <div className="form-group">
                        <label>Clarity</label>
                        <input
                            type="text"
                            value={stoneData.clarity}
                            onChange={(e) => setStoneData({...stoneData, clarity: e.target.value})}
                        />
                    </div>

                    <div className="form-group">
                        <label>Color</label>
                        <input
                            type="text"
                            value={stoneData.color}
                            onChange={(e) => setStoneData({...stoneData, color: e.target.value})}
                        />
                    </div>

                    <div className="form-group">
                        <label>Shape</label>
                        <input
                            type="text"
                            value={stoneData.shape}
                            onChange={(e) => setStoneData({...stoneData, shape: e.target.value})}
                        />
                    </div>
                </div>

                <div style={{marginTop: '24px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <h3>PRICING SLABS</h3>
                        <button className="btn btn-secondary" onClick={addSlab}>
                            + Add Slab
                        </button>
                    </div>

                    <table className="stone-table">
                        <thead>
                            <tr>
                                <th>Srl. No</th>
                                <th>From Weight</th>
                                <th>To Weight</th>
                                <th>Price per Carat</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stoneData.slabs.map((slab, idx) => (
                                <tr key={idx}>
                                    <td>{idx + 1}</td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={slab.fromWeight}
                                            onChange={(e) => updateSlab(idx, 'fromWeight', e.target.value)}
                                            style={{width: '100%', padding: '6px'}}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={slab.toWeight}
                                            onChange={(e) => updateSlab(idx, 'toWeight', e.target.value)}
                                            style={{width: '100%', padding: '6px'}}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={slab.pricePerCarat}
                                            onChange={(e) => updateSlab(idx, 'pricePerCarat', e.target.value)}
                                            style={{width: '100%', padding: '6px'}}
                                            placeholder="INR"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px'}}>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

// Make available globally
window.StoneModal = StoneModal;

