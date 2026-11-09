import { createApp, getPort } from './config/app.js';
import { initializeCalculators } from './middleware/calculatorInit.js';
import { errorHandler } from './middleware/errorHandler.js';
import metalPricesRoutes from './routes/metalPrices.js';
import stonePricesRoutes from './routes/stonePrices.js';
import productsRoutes from './routes/products.js';
import utilsRoutes from './routes/utils.js';
import discountsRoutes from './routes/discounts.js';
import * as webhookHandlers from './webhooks/collectionSync.js';
import { createEmbeddedMessaging } from '../messaging/src/embedded.js';

// Create Express app
const messaging = createEmbeddedMessaging();
const app = createApp({ beforeJson: app => app.use('/messaging', messaging.middleware) });
const PORT = getPort();

// Register routes
app.use('/api/metal-prices', metalPricesRoutes);
app.use('/api/stone-prices', stonePricesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/discounts', discountsRoutes);
app.use('/api', utilsRoutes);

// Webhook routes (before error handler)
app.get('/webhooks/collections/update', webhookHandlers.verifyWebhook);
app.post('/webhooks/collections/update', webhookHandlers.handleCollectionUpdate);
app.get('/webhooks/products/delete', webhookHandlers.verifyWebhook);
app.post('/webhooks/products/delete', webhookHandlers.handleProductDelete);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, async () => {
  console.log(`\n🚀 Jewelry Price App Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health\n`);
  
  // Initialize calculators on startup
  await initializeCalculators();
});

// Start independently: database/provider issues do not stop the price service.
messaging.start();
let shuttingDown = false;
for (const name of ['SIGINT', 'SIGTERM']) process.once(name, async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await messaging.stop();
});

export default app;
