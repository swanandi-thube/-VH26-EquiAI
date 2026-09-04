"use strict";
/**
 * ADAPTIVECACHE Configuration Module
 * Validates and exposes environment configuration variables with multi-path resolution.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Attempt to load .env from multiple candidate locations
const candidateEnvPaths = [
    path_1.default.resolve(process.cwd(), '.env'),
    path_1.default.resolve(process.cwd(), 'backend/.env'),
    path_1.default.resolve(__dirname, '../../.env'),
    path_1.default.resolve(__dirname, '../../../.env'),
];
for (const envPath of candidateEnvPaths) {
    if (fs_1.default.existsSync(envPath)) {
        dotenv_1.default.config({ path: envPath });
        break;
    }
}
const parsePort = (val) => {
    if (!val)
        return 8000;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 8000 : parsed;
};
const cleanUrl = (val) => {
    if (!val)
        return null;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
};
exports.config = {
    env: process.env.NODE_ENV || 'development',
    port: parsePort(process.env.PORT),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    databaseUrl: cleanUrl(process.env.DATABASE_URL),
    redisUrl: cleanUrl(process.env.REDIS_URL),
    logLevel: process.env.LOG_LEVEL || 'info',
    defaultTtlSeconds: parseInt(process.env.DEFAULT_TTL_SECONDS || '300', 10),
    maxCacheCapacityBytes: parseInt(process.env.MAX_CACHE_CAPACITY_BYTES || '67108864', 10), // 64 MB default
};
