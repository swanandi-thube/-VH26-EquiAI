/**
 * ADAPTIVECACHE Configuration Module
 * Validates and exposes environment configuration variables with multi-path resolution.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Attempt to load .env from multiple candidate locations
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

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

const cleanUrl = (val?: string): string | null => {
  if (!val) return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parsePort(process.env.PORT),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: cleanUrl(process.env.DATABASE_URL),
  redisUrl: cleanUrl(process.env.REDIS_URL),
  logLevel: process.env.LOG_LEVEL || 'info',
  defaultTtlSeconds: parseInt(process.env.DEFAULT_TTL_SECONDS || '300', 10),
  maxCacheCapacityBytes: parseInt(process.env.MAX_CACHE_CAPACITY_BYTES || '67108864', 10), // 64 MB default
};
