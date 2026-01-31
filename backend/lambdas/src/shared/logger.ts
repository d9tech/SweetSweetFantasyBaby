/**
 * Structured Logging with AWS Lambda Powertools
 *
 * This module provides a centralized logger that:
 * - Outputs structured JSON logs
 * - Includes Lambda context (request ID, cold start, etc.)
 * - Supports log levels (DEBUG, INFO, WARN, ERROR)
 * - Integrates with CloudWatch Logs Insights
 */

import { Logger } from '@aws-lambda-powertools/logger';

// Create a logger instance with service name
export const logger = new Logger({
  serviceName: process.env.SERVICE_NAME || 'app-api',
  logLevel: (process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR') || 'INFO',
  // Include additional persistent attributes
  persistentLogAttributes: {
    environment: process.env.STAGE || 'dev',
  },
});

/**
 * Example usage:
 *
 * import { logger } from './shared/logger';
 *
 * // Basic logging
 * logger.info('User created', { userId: '123', email: 'user@example.com' });
 *
 * // Error logging with stack trace
 * logger.error('Database connection failed', { error });
 *
 * // Debug logging (only appears when LOG_LEVEL=DEBUG)
 * logger.debug('Query parameters', { params });
 *
 * // Add Lambda context to all logs in a handler
 * export const handler = async (event, context) => {
 *   logger.addContext(context);
 *   logger.info('Handler invoked');
 *   // ...
 * };
 */

export default logger;
