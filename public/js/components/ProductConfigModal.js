const { useState, useEffect } = React;

function ProductConfigModal({ product, onClose, onSave, metalPrices, calculatePrice, configureProduct, fetchStonePrices }) {
    const [config, setConfig] = useState({
        metalWeight: product.configuration?.metal_weight || '',
        metalType: product.configuration?.metal_type || 'gold22kt',
        makingChargePercent: product.configuration?.making_charge_percent || '',
        labourType: product.configuration?.labour_type || 'percentage',
        labourValue: product.configuration?.labour_value || '',
        wastageType: product.configuration?.wastage_type || 'percentage',
        wastageValue: product.configuration?.wastage_value || '',
        stoneType: (product.configuration?.stone_type && product.configuration?.stone_type !== 'none') ? product.configuration?.stone_type : '',
        stoneWeight: product.configuration?.stone_weight || '',
        stoneCost: product.configuration?.stone_cost || '',
        netWeight: product.configuration?.net_weight || '',
        grossWeight: product.configuration?.gross_weight || '',
        taxPercent: product.configuration?.tax_percent || '3'
    });

    const [calculation, setCalculation] = useState(null);
    const [availableStones, setAvailableStones] = useState([]);

    // Load available stones
    useEffect(() => {
        loadStones();
    }, []);

    const loadStones = async () => {
        try {
            const stones = await fetchStonePrices();
            setAvailableStones(stones);
        } catch (error) {
            console.error('Error loading stones:', error);
        }
    };

    // Calculate stone cost when stone type or weight changes (ONLY for diamonds)
    useEffect(() => {
        const selectedStone = availableStones.find(s => s.stone_id === config.stoneType);
        const isDiamond = selectedStone?.stone_type?.toLowerCase() === 'diamond';
        
        if (isDiamond && config.stoneType && config.stoneWeight) {
            calculateStoneCost();
        }
    }, [config.stoneType, config.stoneWeight, availableStones]);

    const calculateStoneCost = () => {
        const selectedStone = availableStones.find(s => s.stone_id === config.stoneType);
        if (!selectedStone || !selectedStone.slabs) {
            console.log('No stone or slabs found');
            return;
        }

        const weight = parseFloat(config.stoneWeight);
        if (isNaN(weight) || weight <= 0) {
            console.log('Invalid weight:', config.stoneWeight);
            return;
        }

        // Find matching slab
        const slab = selectedStone.slabs.find(s => 
            weight >= parseFloat(s.fromWeight) && weight <= parseFloat(s.toWeight)
        );

        if (slab) {
            const pricePerCarat = parseFloat(slab.pricePerCarat);
            const cost = weight * pricePerCarat;
            setConfig(prev => ({ ...prev, stoneCost: cost.toFixed(2) }));
        } else {
            console.log('No matching slab found for weight:', weight);
            alert(`No price slab found for weight ${weight} carat. Please check your stone pricing configuration.`);
        }
    };

    useEffect(() => {
        if (config.metalWeight && config.metalType) {
            calculatePricePreview();
        }
    }, [config]);

    const calculatePricePreview = async () => {
        try {
            const priceBreakdown = await calculatePrice(config);
            setCalculation(priceBreakdown);
        } catch (error) {
            console.error('Error calculating price:', error);
        }
    };

    const handleSave = async () => {
        try {
            // Validate required fields
            if (!config.metalWeight || config.metalWeight === '') {
                alert('Metal Weight is required');
                return;
            }

            if (!config.metalType || config.metalType === '') {
                alert('Metal Type is required');
                return;
            }

            // Normalize empty values to 0 for numeric fields before sending
            const configToSend = {
                ...config,
                makingChargePercent: config.makingChargePercent === '' ? '0' : config.makingChargePercent,
                labourValue: config.labourValue === '' ? '0' : config.labourValue,
                wastageValue: config.wastageValue === '' ? '0' : config.wastageValue,
                stoneWeight: config.stoneWeight === '' ? '0' : config.stoneWeight,
                stoneCost: config.stoneCost === '' ? '0' : config.stoneCost,
                netWeight: config.netWeight === '' ? '0' : config.netWeight,
                grossWeight: config.grossWeight === '' ? '0' : config.grossWeight,
                taxPercent: config.taxPercent === '' ? '3' : config.taxPercent
            };

            const data = await configureProduct(product.id, configToSend);
            if (data.success) {
                alert('Product configured successfully!');
                onSave();
                onClose();
            } else {
                // Parse and display error message
                let errorMessage = 'Error saving configuration';
                if (data.error) {
                    try {
                        const errors = JSON.parse(data.error);
                        if (Array.isArray(errors) && errors.length > 0) {
                            errorMessage = errors.map(e => e.message || e).join('\n');
                        } else {
                            errorMessage = data.error;
                        }
                    } catch {
                        errorMessage = data.error;
                    }
                }
                alert(errorMessage);
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            alert('Error saving configuration: ' + error.message);
        }
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>{product.title}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="card" style={{marginBottom: '16px'}}>
                    <h2>CONFIGURE VARIANT</h2>

                    <div className="form-grid">
                        <div className="form-group">
                            <label>Metal Type *</label>
                            <select
                                value={config.metalType}
                                onChange={(e) => setConfig({...config, metalType: e.target.value})}
                            >
                                <option value="gold24kt">Gold 24K</option>
                                <option value="gold22kt">Gold 22K</option>
                                <option value="gold18kt">Gold 18K</option>
                                <option value="gold14kt">Gold 14K</option>
                                <option value="platinum">Platinum</option>
                                <option value="silver">Silver</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Metal Weight *</label>
                            <div className="input-suffix" data-suffix="Grams">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={config.metalWeight}
                                    onChange={(e) => setConfig({...config, metalWeight: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Making Charge (Optional)</label>
                            <div className="input-suffix" data-suffix="%">
                                <input
                                    type="number"
                                    step="0.1"
                                    value={config.makingChargePercent}
                                    onChange={(e) => setConfig({...config, makingChargePercent: e.target.value})}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Labour Type (Optional)</label>
                            <select
                                value={config.labourType}
                                onChange={(e) => setConfig({...config, labourType: e.target.value})}
                            >
                                <option value="percentage">Percentage</option>
                                <option value="fixed">Fixed</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Labour Value (Optional)</label>
                            <div className="input-suffix" data-suffix={config.labourType === 'percentage' ? '%' : 'INR'}>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={config.labourValue}
                                    onChange={(e) => setConfig({...config, labourValue: e.target.value})}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Wastage Type (Optional)</label>
                            <select
                                value={config.wastageType}
                                onChange={(e) => setConfig({...config, wastageType: e.target.value})}
                            >
                                <option value="percentage">Percentage</option>
                                <option value="fixed">Fixed</option>
                                <option value="weight">Weight</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Wastage Value (Optional)</label>
                            <div className="input-suffix" data-suffix={
                                config.wastageType === 'percentage' ? '%' : 
                                config.wastageType === 'weight' ? 'g' : 'INR'
                            }>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={config.wastageValue}
                                    onChange={(e) => setConfig({...config, wastageValue: e.target.value})}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Net Weight (Optional)</label>
                            <div className="input-suffix" data-suffix="g">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={config.netWeight}
                                    onChange={(e) => setConfig({...config, netWeight: e.target.value})}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Gross Weight (Optional)</label>
                            <div className="input-suffix" data-suffix="g">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={config.grossWeight}
                                    onChange={(e) => setConfig({...config, grossWeight: e.target.value})}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Stone Type (Optional)</label>
                            <select
                                value={config.stoneType}
                                onChange={(e) => {
                                    setConfig({...config, stoneType: e.target.value, stoneWeight: '', stoneCost: ''});
                                }}
                            >
                                <option value="">No Stone</option>
                                {availableStones.map((stone, idx) => (
                                    <option key={idx} value={stone.stone_id}>
                                        {stone.stone_type} (ID: {stone.stone_id})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {config.stoneType && availableStones.find(s => s.stone_id === config.stoneType)?.stone_type?.toLowerCase() === 'diamond' && (
                            <div className="form-group">
                                <label>Diamond Weight (Optional)</label>
                                <div className="input-suffix" data-suffix="Carat">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={config.stoneWeight}
                                        onChange={(e) => setConfig({...config, stoneWeight: e.target.value})}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        )}

                        {config.stoneType && availableStones.find(s => s.stone_id === config.stoneType)?.stone_type?.toLowerCase() !== 'diamond' && (
                            <div className="form-group">
                                <label>Stone Weight (Optional)</label>
                                <div className="input-suffix" data-suffix="Carat">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={config.stoneWeight}
                                        onChange={(e) => setConfig({...config, stoneWeight: e.target.value})}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label>Stone Cost (Optional)</label>
                            <div className="input-suffix" data-suffix="INR">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={config.stoneCost}
                                    onChange={(e) => setConfig({...config, stoneCost: e.target.value})}
                                    disabled={config.stoneType && availableStones.find(s => s.stone_id === config.stoneType)?.stone_type?.toLowerCase() === 'diamond'}
                                    placeholder={config.stoneType && availableStones.find(s => s.stone_id === config.stoneType)?.stone_type?.toLowerCase() === 'diamond' ? 'Auto-calculated' : '0'}
                                />
                            </div>
                            {config.stoneType && config.stoneWeight && availableStones.find(s => s.stone_id === config.stoneType)?.stone_type?.toLowerCase() === 'diamond' && (() => {
                                const selectedStone = availableStones.find(s => s.stone_id === config.stoneType);
                                const weight = parseFloat(config.stoneWeight);
                                const slab = selectedStone?.slabs?.find(s => 
                                    weight >= parseFloat(s.fromWeight) && weight <= parseFloat(s.toWeight)
                                );
                                if (slab) {
                                    return (
                                        <div style={{fontSize: '12px', color: '#6d7175', marginTop: '4px'}}>
                                            💎 {weight} carat × ₹{slab.pricePerCarat}/carat = ₹{config.stoneCost}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>

                        <div className="form-group">
                            <label>Tax (Optional, Default: 3%)</label>
                            <div className="input-suffix" data-suffix="%">
                                <input
                                    type="number"
                                    step="0.1"
                                    value={config.taxPercent}
                                    onChange={(e) => setConfig({...config, taxPercent: e.target.value})}
                                    placeholder="3"
                                />
                            </div>
                        </div>
                    </div>

                    {calculation && (
                        <div className="calculation-result">
                            <h3 style={{marginBottom: '12px', fontSize: '16px'}}>Price Breakdown</h3>
                            <div className="calculation-row">
                                <span>Metal Cost</span>
                                <span>₹{calculation.metalCost.toFixed(2)}</span>
                            </div>
                            <div className="calculation-row">
                                <span>Making Charge</span>
                                <span>₹{calculation.makingCharge.toFixed(2)}</span>
                            </div>
                            <div className="calculation-row">
                                <span>Labour Charge</span>
                                <span>₹{calculation.labourCharge.toFixed(2)}</span>
                            </div>
                            <div className="calculation-row">
                                <span>Wastage Charge</span>
                                <span>₹{calculation.wastageCharge.toFixed(2)}</span>
                            </div>
                            <div className="calculation-row">
                                <span>Stone Cost</span>
                                <span>₹{calculation.stoneCost.toFixed(2)}</span>
                            </div>
                            <div className="calculation-row">
                                <span>Tax Amount ({config.taxPercent}%)</span>
                                <span>₹{calculation.taxAmount.toFixed(2)}</span>
                            </div>
                            <div className="calculation-row total">
                                <span>Final Product Price</span>
                                <span>₹{calculation.finalPrice.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '12px'}}>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

// Make available globally
window.ProductConfigModal = ProductConfigModal;

