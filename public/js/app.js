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

    // Load metal prices on mount
    useEffect(() => {
        loadMetalPrices();
        loadProducts();
        loadStonePrices();
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
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error updating metal prices:', error);
            alert('Error updating prices');
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshPrices = async () => {
        if (!confirm('This will update all product prices based on current metal rates. Continue?')) {
            return;
        }

        try {
            setLoading(true);
            const data = await API.refreshPrices();
            if (data.success) {
                alert(data.message);
                loadProducts();
            }
        } catch (error) {
            console.error('Error refreshing prices:', error);
            alert('Error refreshing prices');
        } finally {
            setLoading(false);
        }
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

            {selectedProduct && (
                <window.ProductConfigModal
                    product={selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                    onSave={loadProducts}
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
        </div>
    );
}

// Make available globally
window.App = App;

