const { useState, useEffect } = React;

// API functions are available from window.API
const API = window.API || {};


function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [metalPrices, setMetalPrices] = useState({
        gold24kt: '',
        gold22kt: '',
        gold18kt: '',
        gold14kt: '',
        platinum: '',
        silver: ''
    });
    const [showSuccess, setShowSuccess] = useState(false);
    const [products, setProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [loading, setLoading] = useState(false);
    const [productsPageInfo, setProductsPageInfo] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageCursors, setPageCursors] = useState({ 1: null }); // Store cursor for each page
    const [stonePrices, setStonePrices] = useState([]);
    const [showStoneModal, setShowStoneModal] = useState(false);
    const [selectedStone, setSelectedStone] = useState(null);
    const [discounts, setDiscounts] = useState([]);
    const [collections, setCollections] = useState([]);

    // Load metal prices on mount
    useEffect(() => {
        loadMetalPrices();
        loadProducts();
        loadStonePrices();
        loadDiscounts();
        loadCollections();
    }, []);

    const loadMetalPrices = async () => {
        try {
            const prices = await API.fetchMetalPrices();
            setMetalPrices(prices);
        } catch (error) {
            console.error('Error loading metal prices:', error);
        }
    };

    const loadProducts = async (page = 1, cursor = null) => {
        try {
            setLoading(true);
            const result = await API.fetchProducts(cursor, 50);
            setProducts(result.products);
            setProductsPageInfo(result.pageInfo);
            setCurrentPage(page);
            // Store cursor for next page if available
            if (result.pageInfo.hasNextPage && result.pageInfo.endCursor) {
                setPageCursors(prev => ({
                    ...prev,
                    [page + 1]: result.pageInfo.endCursor
                }));
            }
        } catch (error) {
            console.error('Error loading products:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleNextPage = () => {
        if (productsPageInfo?.hasNextPage && productsPageInfo?.endCursor) {
            const nextPage = currentPage + 1;
            loadProducts(nextPage, productsPageInfo.endCursor);
        }
    };

    const handlePrevPage = () => {
        if (currentPage > 1) {
            const prevPage = currentPage - 1;
            const cursor = pageCursors[prevPage] || null;
            loadProducts(prevPage, cursor);
        }
    };

    const handleRefreshProducts = () => {
        setPageCursors({ 1: null });
        loadProducts(1, null);
    };

    const loadStonePrices = async () => {
        try {
            const stones = await API.fetchStonePrices();
            setStonePrices(stones);
        } catch (error) {
            console.error('Error loading stone prices:', error);
        }
    };

    const loadDiscounts = async () => {
        try {
            const discountRules = await API.fetchDiscounts();
            setDiscounts(discountRules);
        } catch (error) {
            console.error('Error loading discounts:', error);
        }
    };

    const loadCollections = async () => {
        try {
            const collectionsList = await API.fetchCollections();
            setCollections(collectionsList);
        } catch (error) {
            console.error('Error loading collections:', error);
        }
    };

    const handleMetalPriceChange = (key, value) => {
        setMetalPrices(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleUpdateMetalPrices = async () => {
        try {
            setLoading(true);
            await API.updateMetalPrices(metalPrices);
            setShowSuccess(true);
            alert('Metal prices saved successfully!');
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error updating metal prices:', error);
            alert('Error: Error updating metal prices: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const [refreshJobId, setRefreshJobId] = useState(null);
    const [showRefreshModal, setShowRefreshModal] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

    const showConfirm = (title, message, onConfirm) => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            onConfirm: () => {
                setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
                if (onConfirm) onConfirm();
            }
        });
    };

    const handleRefreshPrices = () => {
        showConfirm(
            'Refresh Product Prices',
            'This will update all product prices based on current metal rates. This may take several minutes for large catalogs. Continue?',
            async () => {
                try {
                    // Show modal immediately with loading state (before API call completes)
                    setShowRefreshModal(true);
                    setLoading(true);
                    
                    const data = await API.refreshPrices();
            
                    // Update with job ID once received
                    if (data && data.success) {
                        const jobId = data.data?.jobId;
                        
                        if (jobId) {
                            setRefreshJobId(jobId);
                        } else {
                            console.error('No jobId in response:', data);
                            setShowRefreshModal(false);
                            alert('Error: No job ID received from server');
                        }
                    } else {
                        console.error('API response not successful:', data);
                        setShowRefreshModal(false);
                        alert('Error: Error starting refresh prices: ' + (data?.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Error starting refresh prices:', error);
                    setShowRefreshModal(false);
                    alert('Error: Error starting refresh prices: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        );
    };

    const handleRefreshModalClose = (wasSuccessful = false) => {
        setShowRefreshModal(false);
        setRefreshJobId(null);
        // Reload products to show updated prices
        loadProducts();
        
        if (wasSuccessful) {
            alert('Product prices refreshed successfully!');
        }
    };

    const handleRefreshCancel = () => {
        setShowRefreshModal(false);
        setRefreshJobId(null);
    };


    return (
        <div className="app-container">
            <div className="header">
                <h1>
                    <div className="logo">L</div>
                    Live Gold Price Editor
                </h1>
            </div>

            <div className="tabs">
                <button 
                    className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dashboard')}
                >
                    Dashboard
                </button>
                <button 
                    className={`tab ${activeTab === 'products' ? 'active' : ''}`}
                    onClick={() => setActiveTab('products')}
                >
                    Products
                </button>
                <button 
                    className={`tab ${activeTab === 'discounts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('discounts')}
                >
                    Discounts
                </button>
                <button 
                    className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                >
                    Settings
                </button>
            </div>

            {activeTab === 'dashboard' && (
                <window.DashboardTab
                    metalPrices={metalPrices}
                    handleMetalPriceChange={handleMetalPriceChange}
                    handleUpdateMetalPrices={handleUpdateMetalPrices}
                    handleRefreshPrices={handleRefreshPrices}
                    showSuccess={showSuccess}
                    loading={loading}
                    stonePrices={stonePrices}
                    setShowStoneModal={setShowStoneModal}
                    setSelectedStone={setSelectedStone}
                    loadStonePrices={loadStonePrices}
                    deleteStonePricing={API.deleteStonePricing}
                />
            )}

            {activeTab === 'products' && (
                <window.ProductsTab
                    products={products}
                    loading={loading}
                    setSelectedProduct={setSelectedProduct}
                    pageInfo={productsPageInfo}
                    currentPage={currentPage}
                    onNextPage={handleNextPage}
                    onPrevPage={handlePrevPage}
                    onRefresh={handleRefreshProducts}
                />
            )}

            {activeTab === 'discounts' && (
                <window.DiscountsTab
                    discounts={discounts}
                    loading={loading}
                    onRefresh={loadDiscounts}
                    collections={collections}
                />
            )}

            {selectedProduct && (
                <window.ProductConfigModal
                    product={selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                    onSave={() => {
                        // Reload current page to see the update
                        const cursor = pageCursors[currentPage] || null;
                        loadProducts(currentPage, cursor);
                    }}
                    metalPrices={metalPrices}
                    calculatePrice={API.calculatePrice}
                    configureProduct={API.configureProduct}
                    fetchStonePrices={API.fetchStonePrices}
                />
            )}

            {showStoneModal && (
                <window.StoneModal
                    stone={selectedStone}
                    onClose={() => {
                        setShowStoneModal(false);
                        setSelectedStone(null);
                    }}
                    onSave={loadStonePrices}
                    saveStonePricing={API.saveStonePricing}
                />
            )}

            {showRefreshModal && (
                window.RefreshProgressModal ? (
                    <window.RefreshProgressModal
                        key={refreshJobId || 'loading-' + Date.now()}
                        jobId={refreshJobId}
                        onClose={(success) => handleRefreshModalClose(success)}
                        onCancel={handleRefreshCancel}
                        getRefreshStatus={API.getRefreshStatus}
                        cancelRefresh={API.cancelRefresh}
                    />
                ) : (
                    <div className="modal" key="fallback-modal">
                        <div className="modal-content" style={{ maxWidth: '500px' }}>
                            <div className="modal-header">
                                <h2>🔄 Refreshing Product Prices</h2>
                                <button className="close-btn" onClick={() => handleRefreshModalClose(false)}>×</button>
                            </div>
                            <div style={{ padding: '20px', textAlign: 'center' }}>
                                {refreshJobId ? (
                                    <>
                                        <p><strong>Job ID:</strong> {refreshJobId}</p>
                                        <p style={{ color: '#6d7175', fontSize: '14px', marginTop: '16px' }}>
                                            RefreshProgressModal component not loaded. Please refresh the page.
                                        </p>
                                    </>
                                ) : (
                                    <p style={{ color: '#6d7175', fontSize: '14px' }}>
                                        Starting refresh job...
                                    </p>
                                )}
                                <button className="btn btn-primary" onClick={() => handleRefreshModalClose(false)} style={{ marginTop: '16px' }}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            )}

            {/* Confirmation Modal */}
            {confirmModal.isOpen && (
                window.ConfirmModal ? (
                    <window.ConfirmModal
                        isOpen={confirmModal.isOpen}
                        title={confirmModal.title}
                        message={confirmModal.message}
                        onConfirm={confirmModal.onConfirm}
                        onCancel={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
                        confirmText="Continue"
                        cancelText="Cancel"
                    />
                ) : (
                    <div className="modal">
                        <div className="modal-content" style={{ maxWidth: '450px' }}>
                            <div className="modal-header">
                                <h2>{confirmModal.title || 'Confirm'}</h2>
                            </div>
                            <div style={{ padding: '20px' }}>
                                <p style={{ marginBottom: '24px', fontSize: '14px', color: '#202223' }}>
                                    {confirmModal.message}
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={confirmModal.onConfirm}
                                    >
                                        Continue
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            )}

        </div>
    );
}

// Make available globally
window.App = App;

