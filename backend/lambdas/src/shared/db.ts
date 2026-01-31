/**
 * Database Connection Management
 *
 * This module handles PostgreSQL connections for Lambda functions.
 *
 * Key considerations for Lambda + RDS:
 * - Connection pooling is tricky (each Lambda instance has its own pool)
 * - Connections should be reused across invocations (kept outside handler)
 * - Max connections should be low (typically 1 per Lambda instance)
 * - Idle timeout should be configured to avoid stale connections
 */

import { Pool, PoolConfig } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from './logger.js';

// Connection pool - initialized once per Lambda instance
let pool: Pool | null = null;

// Secrets Manager client
const secretsManager = new SecretsManagerClient({});

interface DbCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Retrieves database credentials from AWS Secrets Manager
 */
async function getCredentials(): Promise<DbCredentials> {
  const secretArn = process.env.DB_SECRET_ARN;

  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable not set');
  }

  logger.debug('Fetching database credentials from Secrets Manager');

  const response = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (!response.SecretString) {
    throw new Error('No secret string found in Secrets Manager response');
  }

  return JSON.parse(response.SecretString) as DbCredentials;
}

/**
 * Gets or creates the database connection pool
 *
 * The pool is created once per Lambda instance and reused across invocations.
 * This is more efficient than creating a new connection for each request.
 */
export async function getPool(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  logger.info('Creating new database connection pool');

  const credentials = await getCredentials();

  const config: PoolConfig = {
    host: credentials.host,
    port: credentials.port || 5432,
    database: credentials.database,
    user: credentials.username,
    password: credentials.password,

    // IMPORTANT: Lambda-specific settings
    max: 1, // Only 1 connection per Lambda instance
    idleTimeoutMillis: 120000, // Close idle connections after 2 minutes
    connectionTimeoutMillis: 5000, // Fail fast if can't connect

    // SSL configuration for RDS
    ssl: {
      rejectUnauthorized: false, // RDS uses self-signed certs
    },
  };

  pool = new Pool(config);

  // Handle connection errors
  pool.on('error', (err) => {
    logger.error('Unexpected database pool error', { error: err });
    // Reset pool on error to force reconnection
    pool = null;
  });

  // Test the connection
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Database connection established successfully');
  } finally {
    client.release();
  }

  return pool;
}

/**
 * Executes a query with automatic connection handling
 *
 * @example
 * const users = await query<User>('SELECT * FROM users WHERE id = $1', [userId]);
 */
export async function query<T>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = await getPool();
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug('Query executed', {
      query: text,
      duration,
      rowCount: result.rowCount,
    });

    return result.rows as T[];
  } catch (error) {
    logger.error('Query failed', {
      query: text,
      error,
    });
    throw error;
  }
}

/**
 * Gracefully closes the database pool
 * (Useful for testing or cleanup)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
