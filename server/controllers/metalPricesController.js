import { getPriceCalculator, getShopifyAPI, updatePriceCalculatorRates } from '../middleware/calculatorInit.js';
import { log } from '../utils/logger.js';

/**
 * Format price with Indian Rupee symbol and /g suffix
 */
function formatPrice(price) {
  if (!price) return '';
  // Format number with Indian numbering system (lakhs, crores)
  const formatted = new Intl.NumberFormat('en-IN').format(price);
  return `₹${formatted}/g`;
}

/**
 * Get current metal prices
 */
export async function getMetalPrices(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const priceCalculator = getPriceCalculator();
    const prices = await shopifyAPI.getMetalPrices();
    
    res.json({
      success: true,
      data: prices || priceCalculator.getMetalRates()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get formatted metal prices for Shopify theme display
 * Returns prices formatted with ₹ symbol and /g suffix
 */
export async function getFormattedMetalPrices(req, res) {
  try {
    const shopifyAPI = getShopifyAPI();
    const prices = await shopifyAPI.getMetalPrices();
    
    if (!prices) {
      const priceCalculator = getPriceCalculator();
      const fallbackPrices = priceCalculator.getMetalRates();
      
      if (!fallbackPrices) {
        return res.json({
          success: true,
          data: {
            formatted: [],
            raw: {}
          }
        });
      }
      
      // Use fallback prices - Order: Gold 24K, Gold 22K, Gold 18K, Gold 14K, Silver, Platinum
      const formattedPrices = [
        { label: 'Gold 24K', price: formatPrice(fallbackPrices.gold24kt), key: 'gold24kt' },
        { label: 'Gold 22K', price: formatPrice(fallbackPrices.gold22kt), key: 'gold22kt' },
        { label: 'Gold 18K', price: formatPrice(fallbackPrices.gold18kt), key: 'gold18kt' },
        { label: 'Gold 14K', price: formatPrice(fallbackPrices.gold14kt), key: 'gold14kt' },
        { label: 'Silver', price: formatPrice(fallbackPrices.silver), key: 'silver' },
        { label: 'Platinum', price: formatPrice(fallbackPrices.platinum), key: 'platinum' }
      ].filter(item => item.price);
      
      return res.json({
        success: true,
        data: {
          formatted: formattedPrices,
          raw: fallbackPrices
        }
      });
    }

    // Map to formatted display format
    // Prices from Shopify API have keys like gold22kt (no underscores)
    // Order: Gold 24K, Gold 22K, Gold 18K, Gold 14K, Silver, Platinum
    const formattedPrices = [
      { label: 'Gold 24K', price: formatPrice(prices.gold24kt), key: 'gold24kt' },
      { label: 'Gold 22K', price: formatPrice(prices.gold22kt), key: 'gold22kt' },
      { label: 'Gold 18K', price: formatPrice(prices.gold18kt), key: 'gold18kt' },
      { label: 'Gold 14K', price: formatPrice(prices.gold14kt), key: 'gold14kt' },
      { label: 'Silver', price: formatPrice(prices.silver), key: 'silver' },
      { label: 'Platinum', price: formatPrice(prices.platinum), key: 'platinum' }
    ].filter(item => item.price); // Remove empty prices
    
    res.json({
      success: true,
      data: {
        formatted: formattedPrices,
        raw: prices
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update metal prices
 */
export async function updateMetalPrices(req, res) {
  try {
    const { gold24kt, gold22kt, gold18kt, gold14kt, platinum, silver } = req.body;

    // Validate input
    if (!gold24kt || !gold22kt || !gold18kt || !gold14kt || !platinum || !silver) {
      return res.status(400).json({
        success: false,
        error: 'All metal prices are required'
      });
    }

    const shopifyAPI = getShopifyAPI();
    const priceCalculator = getPriceCalculator();

    // Update in Shopify
    const result = await shopifyAPI.updateMetalPrices({
      gold24kt: parseFloat(gold24kt),
      gold22kt: parseFloat(gold22kt),
      gold18kt: parseFloat(gold18kt),
      gold14kt: parseFloat(gold14kt),
      platinum: parseFloat(platinum),
      silver: parseFloat(silver)
    });

    // Update calculator
    updatePriceCalculatorRates({
      gold24kt: parseFloat(gold24kt),
      gold22kt: parseFloat(gold22kt),
      gold18kt: parseFloat(gold18kt),
      gold14kt: parseFloat(gold14kt),
      platinum: parseFloat(platinum),
      silver: parseFloat(silver)
    });

    res.json({
      success: true,
      message: 'Metal prices updated successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * In-memory job store for refresh price jobs
 * In production, consider using Redis or a database for persistence
 */
const refreshJobs = new Map();

/**
 * Generate unique job ID
 */
function generateJobId() {
  return `refresh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Process refresh prices job in background
 */
async function processRefreshJob(jobId, priceCalculator, shopifyAPI, currentRates) {
  const job = refreshJobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'processing';
    job.startedAt = new Date();
    log.info('Refresh prices job started', { jobId, startedAt: job.startedAt }, jobId);

    // Progress callback to update job status
    const progressCallback = (processed, total, updates) => {
      const job = refreshJobs.get(jobId);
      if (!job || job.status === 'cancelled') return;

      job.processed = processed;
      job.total = total;
      job.updates = updates;
      job.successCount = updates.filter(u => u.success).length;
      job.failCount = updates.filter(u => !u.success).length;
      job.progress = Math.round((processed / total) * 100);
      
      // Calculate ETA
      if (processed > 0) {
        const elapsed = (Date.now() - job.startedAt.getTime()) / 1000; // seconds
        const rate = processed / elapsed; // products per second
        const remaining = total - processed;
        job.eta = Math.round(remaining / rate); // seconds remaining
      }
    };

    // Process with progress tracking
    const updates = await shopifyAPI.bulkUpdatePrices(
      currentRates,
      priceCalculator,
      progressCallback,
      log
    );

    const successCount = updates.filter(u => u.success).length;
    const failCount = updates.filter(u => !u.success).length;

    job.status = 'completed';
    job.completedAt = new Date();
    job.processed = job.total;
    job.progress = 100;
    job.successCount = successCount;
    job.failCount = failCount;
    job.updates = updates;
    job.eta = 0;

    log.info('Refresh prices job completed', {
      jobId,
      total: job.total,
      success: successCount,
      failed: failCount,
      duration: (job.completedAt.getTime() - job.startedAt.getTime()) / 1000
    }, jobId);

  } catch (error) {
    const job = refreshJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error.message;
    }
    log.error('Refresh prices job failed', { jobId, error: error.message, stack: error.stack }, jobId);
  }
}

/**
 * Bulk update all product prices based on current metal rates
 * Returns job ID immediately and processes in background
 */
export async function refreshPrices(req, res) {
  try {
    const priceCalculator = getPriceCalculator();
    const shopifyAPI = getShopifyAPI();
    const currentRates = priceCalculator.getMetalRates();

    // Generate job ID
    const jobId = generateJobId();

    // Create job entry
    const job = {
      id: jobId,
      status: 'queued',
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      total: 0,
      processed: 0,
      progress: 0,
      successCount: 0,
      failCount: 0,
      eta: null,
      updates: [],
      error: null
    };

    refreshJobs.set(jobId, job);

    log.info('Refresh prices job created', { jobId }, jobId);

    // Start processing in background (don't await)
    processRefreshJob(jobId, priceCalculator, shopifyAPI, currentRates).catch(err => {
      log.error('Unexpected error in background job', { jobId, error: err.message }, jobId);
    });

    // Return job ID immediately
    res.json({
      success: true,
      message: 'Refresh prices job started',
      data: {
        jobId,
        status: 'queued'
      }
    });
  } catch (error) {
    log.error('Error creating refresh prices job', { error: error.message }, null);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get refresh prices job status
 */
export async function getRefreshStatus(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    const job = refreshJobs.get(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Clean up old completed jobs (older than 1 hour)
    if (job.status === 'completed' || job.status === 'failed') {
      const age = Date.now() - job.completedAt.getTime();
      if (age > 3600000) { // 1 hour
        refreshJobs.delete(jobId);
      }
    }

    res.json({
      success: true,
      data: {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        total: job.total,
        processed: job.processed,
        progress: job.progress,
        successCount: job.successCount,
        failCount: job.failCount,
        eta: job.eta,
        error: job.error,
        // Only include updates if job is completed
        updates: job.status === 'completed' ? job.updates : undefined
      }
    });
  } catch (error) {
    log.error('Error getting refresh status', { error: error.message }, null);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Cancel refresh prices job
 */
export async function cancelRefresh(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    const job = refreshJobs.get(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel a completed or failed job'
      });
    }

    job.status = 'cancelled';
    job.completedAt = new Date();

    log.info('Refresh prices job cancelled', { jobId }, jobId);

    res.json({
      success: true,
      message: 'Job cancelled successfully',
      data: {
        jobId,
        status: 'cancelled'
      }
    });
  } catch (error) {
    log.error('Error cancelling refresh job', { error: error.message }, null);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

