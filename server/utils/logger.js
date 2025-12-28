import winston from 'winston';

/**
 * Structured logger for the application
 * Provides consistent logging format with different log levels
 */
const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Custom format for console output (development)
const consoleFormat = printf(({ level, message, timestamp, jobId, ...data }) => {
  let log = `${timestamp} [${level}]`;
  if (jobId) log += ` [Job: ${jobId}]`;
  log += `: ${message}`;
  
  // Add additional data if present
  const dataKeys = Object.keys(data);
  if (dataKeys.length > 0) {
    log += ` ${JSON.stringify(data)}`;
  }
  
  return log;
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  defaultMeta: { service: 'jewelry-price-app' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? combine(timestamp(), json())
        : combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), consoleFormat)
    })
  ]
});

/**
 * Log with job context
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 * @param {string} jobId - Optional job ID for tracking
 */
export function logWithContext(level, message, data = {}, jobId = null) {
  const logData = { ...data };
  if (jobId) {
    logData.jobId = jobId;
  }
  logger[level](message, logData);
}

/**
 * Convenience methods for common log operations
 */
export const log = {
  info: (message, data = {}, jobId = null) => logWithContext('info', message, data, jobId),
  warn: (message, data = {}, jobId = null) => logWithContext('warn', message, data, jobId),
  error: (message, data = {}, jobId = null) => logWithContext('error', message, data, jobId),
  debug: (message, data = {}, jobId = null) => logWithContext('debug', message, data, jobId)
};

export default logger;

