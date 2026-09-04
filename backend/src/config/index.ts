/**
 * ADAPTIVECACHE Configuration Module
 * Validates and exposes environment configuration variables.
 */

import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface AppConfig {
  env: string;
  port: number;
  corsOrigin: string;
  databaseUrl: string | null;
  redisUrl: string | null;
  logLevel: string;
  defaultTtlSeconds: number;
  maxCacheCapacityBytes: number;
}

const parsePort = (val?: string): number => {
  if (!val) return 8000;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? 8000 : parsed;
};

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parsePort(process.env.PORT),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: process.env.DATABASE_URL || null,
  redisUrl: process.env.REDIS_URL || null,
  logLevel: process.env.LOG_LEVEL || 'info',
  defaultTtlSeconds: parseInt(process.env.DEFAULT_TTL_SECONDS || '300', 10),
  maxCacheCapacityBytes: parseInt(process.env.MAX_CACHE_CAPACITY_BYTES || '67108864', 10), // 64 MB default
};
