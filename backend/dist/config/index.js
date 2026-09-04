"use strict";
/**
 * ADAPTIVECACHE Configuration Module
 * Validates and exposes environment configuration variables.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file
dotenv_1.default.config();
const parsePort = (val) => {
    if (!val)
        return 8000;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 8000 : parsed;
};
exports.config = {
    env: process.env.NODE_ENV || 'development',
    port: parsePort(process.env.PORT),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    databaseUrl: process.env.DATABASE_URL || null,
    redisUrl: process.env.REDIS_URL || null,
    logLevel: process.env.LOG_LEVEL || 'info',
    defaultTtlSeconds: parseInt(process.env.DEFAULT_TTL_SECONDS || '300', 10),
    maxCacheCapacityBytes: parseInt(process.env.MAX_CACHE_CAPACITY_BYTES || '67108864', 10), // 64 MB default
};
