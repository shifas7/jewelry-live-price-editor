import { createApp, getPort } from './config/app.js';
import { initializeCalculators } from './middleware/calculatorInit.js';
import { errorHandler } from './middleware/errorHandler.js';
import metalPricesRoutes from './routes/metalPrices.js';
import stonePricesRoutes from './routes/stonePrices.js';
import productsRoutes from './routes/products.js';
import utilsRoutes from './routes/utils.js';

// Create Express app
const app = createApp();
const PORT = getPort();

// Register routes
app.use('/api/metal-prices', metalPricesRoutes);
app.use('/api/stone-prices', stonePricesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api', utilsRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  console.log(`\n🚀 Jewelry Price App Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health\n`);
  
  // Initialize calculators on startup
  await initializeCalculators();
});

export default app;
