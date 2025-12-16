const { useState, useEffect, useRef } = React;

function ProductConfigModal({ product, onClose, onSave, metalPrices, calculatePrice, configureProduct, fetchStonePrices }) {
    // Initialize stones array from configuration
    const initializeStones = () => {
        if (product.configuration?.stones) {
            // If stones array exists, parse it (it might be a JSON string)
            try {
                const stones = typeof product.configuration.stones === 'string' 
                    ? JSON.parse(product.configuration.stones) 
                    : product.configuration.stones;
                // Ensure stoneCount exists for each stone (default to 1)
                return Array.isArray(stones) ? stones.map(stone => ({
                    ...stone,
                    stoneCount: stone.stoneCount !== undefined ? stone.stoneCount : 1
                })) : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    };

    const [config, setConfig] = useState({
        metalWeight: product.configuration?.metal_weight || '',
        metalType: product.configuration?.metal_type || 'gold22kt',
        makingChargePercent: product.configuration?.making_charge_percent || '',
        labourType: product.configuration?.labour_type || 'percentage',
        labourValue: product.configuration?.labour_value || '',
        wastageType: product.configuration?.wastage_type || 'percentage',
        wastageValue: product.configuration?.wastage_value || '',
        stones: initializeStones(),
        netWeight: product.configuration?.net_weight || '',
        grossWeight: product.configuration?.gross_weight || '',
        taxPercent: product.configuration?.tax_percent || '3'
    });

    const [calculation, setCalculation] = useState(null);
    const [availableStones, setAvailableStones] = useState([]);
    const prevStonesKeyRef = useRef('');
    const [showDiscountSection, setShowDiscountSection] = useState(false);
    const [discount, setDiscount] = useState({
        enabled: false,
        discountValue: '',
        weightSlabs: []
    });
    
    // Load discount from product configuration if it exists
    const [productDiscount, setProductDiscount] = useState(null);
    const [isLoadingDiscount, setIsLoadingDiscount] = useState(false);
    
    useEffect(() => {
        // First check if discount is already in product.configuration
        if (product.configuration?.discount) {
            try {
                // Parse discount if it's a string, otherwise use as-is
                const discountData = typeof product.configuration.discount === 'string'
                    ? JSON.parse(product.configuration.discount)
                    : product.configuration.discount;
                
                if (discountData && discountData.enabled) {
                    setProductDiscount(discountData);
                    return;
                }
            } catch (e) {
                // Error parsing discount, continue to fetch
            }
        }
        
        // Always fetch full configuration to ensure we have the latest discount
        // This is important because the product list might be cached
        if (product.id) {
            setIsLoadingDiscount(true);
            const fetchFullConfig = async () => {
                try {
                    const API = window.API || {};
                    const fullConfig = await API.fetchProductConfiguration(product.id);
                    if (fullConfig.discount && fullConfig.discount.enabled) {
                        setProductDiscount(fullConfig.discount);
                    }
                } catch (error) {
                    console.error('Error fetching product configuration:', error);
                } finally {
                    setIsLoadingDiscount(false);
                }
            };
            fetchFullConfig();
        }
    }, [product.id, product.configuration?.discount]);

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

    // Calculate stone cost when stone type, weight, or count changes (ONLY for diamonds)
    useEffect(() => {
        if (!availableStones.length || !config.stones.length) return;

        // Create a key from stone types, weights, and counts (not costs) to detect actual changes
        const stonesKey = config.stones.map(s => `${s.stoneType}-${s.stoneWeight}-${s.stoneCount === '' || s.stoneCount === undefined ? 1 : s.stoneCount}`).join('|');
        
        // Only recalculate if the key changed (type, weight, or count changed, not just cost)
        if (stonesKey === prevStonesKeyRef.current) return;
        prevStonesKeyRef.current = stonesKey;

        const updatedStones = config.stones.map((stone, index) => {
            if (!stone.stoneType || !stone.stoneWeight) return stone;

            const selectedStone = availableStones.find(s => s.stone_id === stone.stoneType);
            const isDiamond = selectedStone?.stone_type?.toLowerCase() === 'diamond';
            
            if (isDiamond) {
                return calculateStoneCostForIndex(stone, selectedStone, index);
            }
            return stone;
        });

        setConfig(prev => ({ ...prev, stones: updatedStones }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.stones, availableStones.length]);

    const calculateStoneCostForIndex = (stone, selectedStone, index) => {
        if (!selectedStone || !selectedStone.slabs) {
            return { ...stone, stoneCost: '' };
        }

        const weight = parseFloat(stone.stoneWeight);
        if (isNaN(weight) || weight <= 0) {
            return { ...stone, stoneCost: '' };
        }

        // Get stone count (default to 1 if not provided)
        const stoneCount = parseInt(stone.stoneCount) || 1;

        // Find matching slab
        const slab = selectedStone.slabs.find(s => 
            weight >= parseFloat(s.fromWeight) && weight <= parseFloat(s.toWeight)
        );

        if (slab) {
            const pricePerCarat = parseFloat(slab.pricePerCarat);
            const cost = weight * pricePerCarat * stoneCount;
            return { ...stone, stoneCost: cost.toFixed(2), stoneCount: stoneCount };
        } else {
            console.log(`No matching slab found for stone ${index + 1}, weight: ${weight} carat`);
            return { ...stone, stoneCost: '', stoneCount: stoneCount };
        }
    };

    // Recalculate price when discount is loaded
    useEffect(() => {
        if (productDiscount && productDiscount.enabled && config.metalWeight && config.metalType) {
            calculatePricePreview();
        }
    }, [productDiscount]);
    
    useEffect(() => {
        if (config.metalWeight && config.metalType) {
            // Wait a bit for discount to load if it's being fetched
            if (isLoadingDiscount) {
                return;
            }
            calculatePricePreview();
        }
    }, [config.metalWeight, config.metalType, config.makingChargePercent, config.labourType, config.labourValue, config.wastageType, config.wastageValue, config.taxPercent, config.stones.map(s => s.stoneCost).join(','), isLoadingDiscount]);

    const calculatePricePreview = async () => {
        try {
            // Calculate total stone cost from all stones
            const totalStoneCost = config.stones.reduce((sum, stone) => {
                const cost = parseFloat(stone.stoneCost) || 0;
                return sum + cost;
            }, 0);

            // Create config for API call with total stone cost
            const configForAPI = {
                ...config,
                stoneCost: totalStoneCost
            };

            // Include product discount if it exists
            // Convert product discount to discount config format if needed
            let discountConfig = null;
            if (productDiscount && productDiscount.enabled) {
                // The discount from product metafield may need to be converted to the format expected by calculatePrice
                // The discount metafield contains: enabled, discount_id, discount_title, applied_rule, discount_amount, applied_at
                // But calculatePrice expects: enabled, goldRules/diamondRules/silverRules based on product type
                // For now, we'll pass the discount as-is and let the backend handle it
                // The backend will need to fetch the full discount rules from the discount_id
                discountConfig = productDiscount;
            }

            const priceBreakdown = await calculatePrice(configForAPI, discountConfig);
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

            // Normalize stones array - ensure all numeric fields are properly formatted
            const normalizedStones = config.stones.map(stone => {
                const selectedStone = availableStones.find(s => s.stone_id === stone.stoneType);
                return {
                    stoneType: stone.stoneType || '', // stone_id
                    actualStoneType: selectedStone?.stone_type || '', // actual type like "Diamond"
                    stoneWeight: stone.stoneWeight === '' ? '0' : stone.stoneWeight,
                    stoneCost: stone.stoneCost === '' ? '0' : stone.stoneCost,
                    stoneCount: stone.stoneCount === undefined || stone.stoneCount === '' ? 1 : parseInt(stone.stoneCount) || 1
                };
            });

            // Normalize empty values to 0 for numeric fields before sending
            const configToSend = {
                ...config,
                makingChargePercent: config.makingChargePercent === '' ? '0' : config.makingChargePercent,
                labourValue: config.labourValue === '' ? '0' : config.labourValue,
                wastageValue: config.wastageValue === '' ? '0' : config.wastageValue,
                stones: normalizedStones,
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
                        {/* Column 1: SKU, Metal Type, Making Charge, Tax */}
                        <div className="form-group">
                            <label>SKU</label>
                            <input
                                type="text"
                                value={product.sku || product.configuration?.sku || ''}
                                disabled
                                style={{backgroundColor: '#f5f5f5', cursor: 'not-allowed'}}
                            />
                        </div>

                        {/* Column 2: Gross Weight, Labour Type, Labour Charge */}
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

                        {/* Column 3: Net Weight (metal weight), Wastage Type, Wastage Charge */}
                        <div className="form-group">
                            <label>Net Weight (metal weight) *</label>
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
                            <label>Labour Charge (Optional)</label>
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
                            <label>Wastage Charge (Optional)</label>
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

                    {/* Stones Section */}
                    <div style={{marginTop: '24px', borderTop: '1px solid #e0e0e0', paddingTop: '16px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                            <h3 style={{margin: 0, fontSize: '16px'}}>Stones (Optional)</h3>
                            <button 
                                type="button"
                                className="btn btn-secondary" 
                                onClick={() => {
                                    setConfig({
                                        ...config,
                                        stones: [...config.stones, { stoneType: '', stoneWeight: '', stoneCost: '', stoneCount: 1 }]
                                    });
                                }}
                                style={{padding: '6px 12px', fontSize: '14px'}}
                            >
                                + Add More Stone
                            </button>
                        </div>

                        {config.stones.length === 0 && (
                            <div style={{padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', color: '#666', fontSize: '14px'}}>
                                No stones added. Click "Add More Stone" to add stones.
                            </div>
                        )}

                        {config.stones.map((stone, stoneIndex) => {
                            const selectedStone = availableStones.find(s => s.stone_id === stone.stoneType);
                            const isDiamond = selectedStone?.stone_type?.toLowerCase() === 'diamond';
                            
                            return (
                                <div key={stoneIndex} style={{
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    marginBottom: '16px',
                                    backgroundColor: '#fafafa',
                                    position: 'relative',
                                    width: 'fit-content'
                                }}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                                        <h4 style={{margin: 0, fontSize: '14px', fontWeight: '600'}}>Stone {stoneIndex + 1}</h4>
                                        {config.stones.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newStones = config.stones.filter((_, idx) => idx !== stoneIndex);
                                                    setConfig({ ...config, stones: newStones });
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#d32f2f',
                                                    cursor: 'pointer',
                                                    fontSize: '18px',
                                                    padding: '0 8px',
                                                    lineHeight: '1'
                                                }}
                                                title="Remove stone"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>

                                    <div className="form-grid">
                                        <div className="form-group">
                                            <label>Stone Type</label>
                                            <select
                                                value={stone.stoneType}
                                                onChange={(e) => {
                                                    const newStones = [...config.stones];
                                                    newStones[stoneIndex] = {
                                                        ...newStones[stoneIndex],
                                                        stoneType: e.target.value,
                                                        stoneWeight: '',
                                                        stoneCost: '',
                                                        stoneCount: newStones[stoneIndex].stoneCount || 1
                                                    };
                                                    setConfig({ ...config, stones: newStones });
                                                }}
                                            >
                                                <option value="">Select Stone Type</option>
                                                {availableStones.map((s, idx) => (
                                                    <option key={idx} value={s.stone_id}>
                                                        {s.stone_type} (ID: {s.stone_id})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label>{isDiamond ? 'Diamond Weight' : 'Stone Weight'}</label>
                                            <div className="input-suffix" data-suffix="Carat">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={stone.stoneWeight}
                                                    onChange={(e) => {
                                                        const newStones = [...config.stones];
                                                        newStones[stoneIndex] = {
                                                            ...newStones[stoneIndex],
                                                            stoneWeight: e.target.value,
                                                            stoneCount: newStones[stoneIndex].stoneCount || 1
                                                        };
                                                        setConfig({ ...config, stones: newStones });
                                                    }}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Stone Count (Optional)</label>
                                            <input
                                                type="number"
                                                step="1"
                                                min="1"
                                                value={stone.stoneCount !== undefined && stone.stoneCount !== '' ? stone.stoneCount : ''}
                                                onChange={(e) => {
                                                    const newStones = [...config.stones];
                                                    const inputValue = e.target.value;
                                                    // Allow empty string during typing, only parse if there's a value
                                                    newStones[stoneIndex] = {
                                                        ...newStones[stoneIndex],
                                                        stoneCount: inputValue === '' ? '' : (parseInt(inputValue) || '')
                                                    };
                                                    setConfig({ ...config, stones: newStones });
                                                }}
                                                onBlur={(e) => {
                                                    // Normalize to 1 if empty when field loses focus
                                                    if (e.target.value === '' || parseInt(e.target.value) < 1) {
                                                        const newStones = [...config.stones];
                                                        newStones[stoneIndex] = {
                                                            ...newStones[stoneIndex],
                                                            stoneCount: 1
                                                        };
                                                        setConfig({ ...config, stones: newStones });
                                                    }
                                                }}
                                                placeholder="1"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Stone Cost</label>
                                            <div className="input-suffix" data-suffix="INR">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={stone.stoneCost}
                                                    onChange={(e) => {
                                                        const newStones = [...config.stones];
                                                        newStones[stoneIndex] = {
                                                            ...newStones[stoneIndex],
                                                            stoneCost: e.target.value
                                                        };
                                                        setConfig({ ...config, stones: newStones });
                                                    }}
                                                    disabled={isDiamond}
                                                    placeholder={isDiamond ? 'Auto-calculated' : '0'}
                                                />
                                            </div>
                                            {isDiamond && stone.stoneType && stone.stoneWeight && (() => {
                                                const weight = parseFloat(stone.stoneWeight);
                                                const count = parseInt(stone.stoneCount) || 1;
                                                const slab = selectedStone?.slabs?.find(s => 
                                                    weight >= parseFloat(s.fromWeight) && weight <= parseFloat(s.toWeight)
                                                );
                                                if (slab && stone.stoneCost) {
                                                    return (
                                                        <div style={{fontSize: '12px', color: '#6d7175', marginTop: '4px'}}>
                                                            💎 {weight} carat × {count} × ₹{slab.pricePerCarat}/carat = ₹{stone.stoneCost}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
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
                            
                            {/* Show Subtotal */}
                            <div className="calculation-row" style={{
                                borderTop: '1px solid #e0e0e0',
                                paddingTop: '8px',
                                marginTop: '4px',
                                fontWeight: '500'
                            }}>
                                <span>Subtotal</span>
                                <span>₹{calculation.subtotal.toFixed(2)}</span>
                            </div>
                            
                            {/* Discount Information */}
                            {calculation.discount && calculation.discount.discountAmount > 0 ? (
                                <>
                                    <div className="calculation-row" style={{
                                        color: '#28a745',
                                        fontWeight: '500'
                                    }}>
                                        <span>
                                            Discount Amount
                                            {productDiscount?.discount_title && (
                                                <span style={{fontSize: '12px', color: '#666', marginLeft: '8px'}}>
                                                    ({productDiscount.discount_title})
                                                </span>
                                            )}
                                        </span>
                                        <span style={{color: '#28a745'}}>-₹{calculation.discount.discountAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="calculation-row">
                                        <span>Discounted Subtotal</span>
                                        <span>₹{(calculation.discountedSubtotal || (calculation.subtotal - calculation.discount.discountAmount)).toFixed(2)}</span>
                                    </div>
                                    <div className="calculation-row" style={{
                                        textDecoration: 'line-through',
                                        color: '#999'
                                    }}>
                                        <span>Price Before Discount</span>
                                        <span style={{textDecoration: 'line-through', color: '#999'}}>₹{(calculation.priceBeforeDiscount || calculation.finalPrice).toFixed(2)}</span>
                                    </div>
                                    <div className="calculation-row">
                                        <span>Tax Amount ({config.taxPercent}%)</span>
                                        <span>₹{calculation.taxAmount.toFixed(2)}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="calculation-row">
                                    <span>Tax Amount ({config.taxPercent}%)</span>
                                    <span>₹{calculation.taxAmount.toFixed(2)}</span>
                                </div>
                            )}
                            
                            <div className="calculation-row total" style={{
                                borderTop: calculation.discount && calculation.discount.discountAmount > 0 ? '2px solid #28a745' : '2px solid #333',
                                paddingTop: '8px',
                                marginTop: calculation.discount && calculation.discount.discountAmount > 0 ? '4px' : '0'
                            }}>
                                <span>Final Product Price</span>
                                <span style={{
                                    color: calculation.discount && calculation.discount.discountAmount > 0 ? '#28a745' : 'inherit',
                                    fontWeight: 'bold',
                                    fontSize: calculation.discount && calculation.discount.discountAmount > 0 ? '18px' : 'inherit'
                                }}>
                                    ₹{(calculation.finalPriceAfterDiscount || calculation.finalPrice).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Discount Section */}
                    <div style={{marginTop: '24px', borderTop: '1px solid #e0e0e0', paddingTop: '16px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                            <h3 style={{margin: 0, fontSize: '16px'}}>Discount (Optional)</h3>
                            <button 
                                type="button"
                                className="btn btn-secondary" 
                                onClick={() => setShowDiscountSection(!showDiscountSection)}
                                style={{padding: '6px 12px', fontSize: '14px'}}
                            >
                                {showDiscountSection ? 'Hide Discount' : 'Add Discount'}
                            </button>
                        </div>

                        {showDiscountSection && (
                            <div style={{padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px'}}>
                                <div style={{fontSize: '12px', color: '#666', marginBottom: '12px'}}>
                                    Configure product-specific discount. Discounts are applied based on product type:
                                    Gold (% on making), Diamond (₹ on stones), Silver (weight slabs).
                                </div>

                                <div className="form-group">
                                    <label style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        <input
                                            type="checkbox"
                                            checked={discount.enabled}
                                            onChange={(e) => setDiscount({...discount, enabled: e.target.checked})}
                                            style={{cursor: 'pointer'}}
                                        />
                                        Enable Discount for this Product
                                    </label>
                                </div>

                                {discount.enabled && (
                                    <div>
                                        <div className="form-group">
                                            <label>Discount Value</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={discount.discountValue}
                                                onChange={(e) => setDiscount({...discount, discountValue: e.target.value})}
                                                placeholder="Enter discount amount/percentage"
                                            />
                                            <div style={{fontSize: '12px', color: '#666', marginTop: '4px'}}>
                                                For bulk discount application, use the "Discounts" tab
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
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

