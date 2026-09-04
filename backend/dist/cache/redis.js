"use strict";
/**
 * Real Redis Cache Engine & Client for ADAPTIVECACHE
 * Connects to live Redis via REDIS_URL using ioredis.
 * Implements GET, SET, SETEX, DEL, EXPIRE, TTL, DBSIZE, FLUSHALL with
 * separate tracking of adaptive_cache_evictions and redis_native_evictions.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisCache = exports.RedisCacheService = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
class RedisCacheService {
    redisClient = null;
    isConnected = false;
    // In-memory Redis Store (Fallback / local mirror)
    fallbackStore = new Map();
    maxMemoryBytes = config_1.config.maxCacheCapacityBytes;
    usedMemoryBytes = 0;
    // Performance and eviction counters
    hits = 0;
    misses = 0;
    adaptiveEvictions = 0;
    redisNativeEvictions = 0;
    refreshes = 0;
    preCaches = 0;
    constructor() {
        this.initRedis();
        this.startExpirationCycle();
    }
    async initRedis() {
        if (config_1.config.redisUrl) {
            try {
                this.redisClient = new ioredis_1.default(config_1.config.redisUrl, {
                    connectTimeout: 5000,
                    maxRetriesPerRequest: 3,
                    lazyConnect: true,
                    retryStrategy: (times) => {
                        const delay = Math.min(times * 200, 3000);
                        console.log(`[Redis] Reconnection attempt #${times} in ${delay}ms...`);
                        return delay;
                    },
                });
                this.redisClient.on('connect', () => {
                    console.log('[Redis] Socket connection established to REDIS_URL.');
                });
                this.redisClient.on('ready', () => {
                    this.isConnected = true;
                    console.log('[Redis] Live Redis instance ready and responsive.');
                });
                this.redisClient.on('reconnecting', (ms) => {
                    this.isConnected = false;
                    console.warn(`[Redis] Reconnecting to Redis in ${ms}ms...`);
                });
                this.redisClient.on('close', () => {
                    this.isConnected = false;
                });
                this.redisClient.on('error', (err) => {
                    this.isConnected = false;
                    console.warn(`[Redis Error]: ${err.message}`);
                });
                await this.redisClient.connect();
                const pong = await this.redisClient.ping();
                if (pong === 'PONG') {
                    this.isConnected = true;
                    console.log('[Redis] Initial PING verified (PONG received).');
                }
            }
            catch (err) {
                this.isConnected = false;
                console.warn(`[Redis] Live connection failed (${err.message}). Operating in high-speed integrated Redis Cache Engine.`);
            }
        }
        else {
            this.isConnected = false;
            console.log('[Redis] No REDIS_URL provided. Operating in high-speed integrated Redis Cache Engine.');
        }
    }
    setCapacity(bytes) {
        this.maxMemoryBytes = bytes;
    }
    getCapacity() {
        return this.maxMemoryBytes;
    }
    /**
     * Periodic local TTL sweep and native Redis eviction check
     */
    startExpirationCycle() {
        setInterval(async () => {
            const now = Date.now();
            // Sweep local fallback store
            for (const [key, entry] of this.fallbackStore.entries()) {
                if (entry.expiresAt && entry.expiresAt <= now) {
                    this.del(key);
                }
            }
            // Query live Redis native evictions if connected
            if (this.isConnected && this.redisClient) {
                try {
                    const info = await this.redisClient.info('stats');
                    const match = info.match(/evicted_keys:(\d+)/);
                    if (match && match[1]) {
                        this.redisNativeEvictions = parseInt(match[1], 10);
                    }
                }
                catch {
                    // ignore background stats poll error
                }
            }
        }, 1000);
    }
    /**
     * GET cache key
     */
    async get(key) {
        const now = Date.now();
        // 1. If connected to live Redis, query Redis directly
        if (this.isConnected && this.redisClient) {
            try {
                const val = await this.redisClient.get(key);
                if (val !== null) {
                    this.hits++;
                    // Fetch metadata from companion key
                    const metaStr = await this.redisClient.get(`${key}:meta`);
                    let meta;
                    if (metaStr) {
                        meta = JSON.parse(metaStr);
                        const ttl = await this.redisClient.ttl(key);
                        meta.remainingTtlSeconds = Math.max(0, ttl);
                    }
                    else {
                        meta = {
                            objectId: key.replace(/^cache:(obj:)?/, ''),
                            key,
                            sizeBytes: Buffer.byteLength(val, 'utf8'),
                            createdAt: now,
                            updatedAt: now,
                            lastAccessed: now,
                            accessCount: 1,
                            frequency: 1,
                            recentAccessCount: 1,
                            retrievalCostMs: 50,
                            backendLatencyMs: 50,
                            ttlSeconds: 300,
                            remainingTtlSeconds: 300,
                            expiresAt: now + 300000,
                            predictedDemand: 0,
                            confidence: 0.5,
                            adaptiveScore: 0.5,
                            lastDecision: 'KEEP',
                            currentState: 'KEEP',
                            lastDecisionTime: now,
                        };
                    }
                    return { value: val, metadata: meta, hit: true };
                }
                else {
                    this.misses++;
                    return { value: null, metadata: null, hit: false };
                }
            }
            catch (err) {
                console.warn(`[Redis] Live GET error: ${err.message}. Checking fallback.`);
            }
        }
        // 2. Fallback in-memory Redis Engine
        const entry = this.fallbackStore.get(key);
        if (!entry) {
            this.misses++;
            return { value: null, metadata: null, hit: false };
        }
        // Check expiration
        if (entry.expiresAt && entry.expiresAt <= now) {
            this.del(key);
            this.misses++;
            return { value: null, metadata: null, hit: false };
        }
        if (entry.expiresAt) {
            entry.metadata.remainingTtlSeconds = Math.max(0, Math.round((entry.expiresAt - now) / 1000));
        }
        this.hits++;
        return {
            value: entry.value,
            metadata: { ...entry.metadata },
            hit: true,
        };
    }
    /**
     * SET cache key with value, metadata, and optional TTL
     */
    async set(key, value, metadataPartial = {}, ttlSeconds) {
        const now = Date.now();
        const sizeBytes = metadataPartial.sizeBytes || Buffer.byteLength(value, 'utf8') + 256;
        const ttl = ttlSeconds !== undefined ? ttlSeconds : (metadataPartial.ttlSeconds || config_1.config.defaultTtlSeconds);
        const expiresAt = ttl > 0 ? now + (ttl * 1000) : null;
        const fullMetadata = {
            objectId: metadataPartial.objectId || key.replace(/^cache:(obj:)?/, ''),
            key,
            sizeBytes,
            createdAt: metadataPartial.createdAt || now,
            updatedAt: metadataPartial.updatedAt || now,
            lastAccessed: metadataPartial.lastAccessed || now,
            accessCount: metadataPartial.accessCount !== undefined ? metadataPartial.accessCount : 1,
            frequency: metadataPartial.frequency !== undefined ? metadataPartial.frequency : (metadataPartial.accessCount || 1),
            recentAccessCount: metadataPartial.recentAccessCount !== undefined ? metadataPartial.recentAccessCount : 1,
            retrievalCostMs: metadataPartial.retrievalCostMs || 50,
            backendLatencyMs: metadataPartial.backendLatencyMs || 50,
            ttlSeconds: ttl,
            remainingTtlSeconds: ttl,
            expiresAt: expiresAt || 0,
            predictedDemand: metadataPartial.predictedDemand ?? 0,
            confidence: metadataPartial.confidence ?? 0.5,
            adaptiveScore: metadataPartial.adaptiveScore ?? 0.5,
            lastDecision: metadataPartial.lastDecision || 'KEEP',
            currentState: metadataPartial.currentState || metadataPartial.lastDecision || 'KEEP',
            lastDecisionTime: metadataPartial.lastDecisionTime || now,
            payloadPreview: value.length > 100 ? value.substring(0, 100) + '...' : value,
            isPreCached: metadataPartial.isPreCached || false,
        };
        // Live Redis write
        if (this.isConnected && this.redisClient) {
            try {
                if (ttl > 0) {
                    await this.redisClient.set(key, value, 'EX', ttl);
                    await this.redisClient.set(`${key}:meta`, JSON.stringify(fullMetadata), 'EX', ttl);
                }
                else {
                    await this.redisClient.set(key, value);
                    await this.redisClient.set(`${key}:meta`, JSON.stringify(fullMetadata));
                }
            }
            catch (err) {
                console.warn(`[Redis] Live SET error: ${err.message}`);
            }
        }
        // Mirror to fallback store & enforce adaptive capacity
        const existing = this.fallbackStore.get(key);
        if (existing) {
            this.usedMemoryBytes -= existing.metadata.sizeBytes;
        }
        while (this.usedMemoryBytes + sizeBytes > this.maxMemoryBytes && this.fallbackStore.size > 0) {
            this.evictOne();
        }
        this.fallbackStore.set(key, {
            value,
            metadata: fullMetadata,
            expiresAt,
        });
        this.usedMemoryBytes += sizeBytes;
        return true;
    }
    /**
     * SETEX shortcut
     */
    async setex(key, ttlSeconds, value, metadataPartial = {}) {
        return this.set(key, value, metadataPartial, ttlSeconds);
    }
    /**
     * DEL cache key
     */
    async del(key) {
        if (this.isConnected && this.redisClient) {
            try {
                await this.redisClient.del(key);
                await this.redisClient.del(`${key}:meta`);
            }
            catch (err) {
                console.warn(`[Redis] Live DEL error: ${err.message}`);
            }
        }
        const entry = this.fallbackStore.get(key);
        if (entry) {
            this.usedMemoryBytes = Math.max(0, this.usedMemoryBytes - entry.metadata.sizeBytes);
            this.fallbackStore.delete(key);
            return true;
        }
        return false;
    }
    /**
     * EXPIRE key with new TTL
     */
    async expire(key, ttlSeconds) {
        if (this.isConnected && this.redisClient) {
            try {
                await this.redisClient.expire(key, ttlSeconds);
                await this.redisClient.expire(`${key}:meta`, ttlSeconds);
            }
            catch (err) {
                console.warn(`[Redis] Live EXPIRE error: ${err.message}`);
            }
        }
        const entry = this.fallbackStore.get(key);
        if (entry) {
            const now = Date.now();
            entry.expiresAt = now + (ttlSeconds * 1000);
            entry.metadata.ttlSeconds = ttlSeconds;
            entry.metadata.remainingTtlSeconds = ttlSeconds;
            entry.metadata.expiresAt = entry.expiresAt;
            return true;
        }
        return false;
    }
    /**
     * TTL of key in seconds (-1 if no expire, -2 if not found)
     */
    async ttl(key) {
        if (this.isConnected && this.redisClient) {
            try {
                return await this.redisClient.ttl(key);
            }
            catch {
                // Fallback
            }
        }
        const entry = this.fallbackStore.get(key);
        if (!entry)
            return -2;
        if (!entry.expiresAt)
            return -1;
        return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
    }
    /**
     * Evicts the lowest-scoring item based on adaptive score or LRU fallback
     */
    evictOne() {
        if (this.fallbackStore.size === 0)
            return null;
        let candidateKey = null;
        let lowestScore = Number.MAX_VALUE;
        for (const [key, entry] of this.fallbackStore.entries()) {
            const score = entry.metadata.adaptiveScore !== undefined ? entry.metadata.adaptiveScore : 0.5;
            if (score < lowestScore) {
                lowestScore = score;
                candidateKey = key;
            }
            else if (score === lowestScore && candidateKey) {
                const currentCandidate = this.fallbackStore.get(candidateKey);
                if (currentCandidate && entry.metadata.lastAccessed < currentCandidate.metadata.lastAccessed) {
                    candidateKey = key;
                }
            }
        }
        if (candidateKey) {
            this.del(candidateKey);
            this.adaptiveEvictions++;
            return candidateKey;
        }
        return null;
    }
    /**
     * Update metadata on an active key
     */
    updateMetadata(key, patch) {
        const entry = this.fallbackStore.get(key);
        if (entry) {
            entry.metadata = {
                ...entry.metadata,
                ...patch,
            };
            if (this.isConnected && this.redisClient) {
                this.redisClient.set(`${key}:meta`, JSON.stringify(entry.metadata)).catch(() => { });
            }
            return true;
        }
        return false;
    }
    incrementPreCache() {
        this.preCaches++;
    }
    incrementRefresh() {
        this.refreshes++;
    }
    getAllObjects() {
        const now = Date.now();
        const list = [];
        for (const entry of this.fallbackStore.values()) {
            if (entry.expiresAt) {
                entry.metadata.remainingTtlSeconds = Math.max(0, Math.round((entry.expiresAt - now) / 1000));
            }
            list.push({ ...entry.metadata });
        }
        return list.sort((a, b) => b.lastAccessed - a.lastAccessed);
    }
    async dbsize() {
        if (this.isConnected && this.redisClient) {
            try {
                return await this.redisClient.dbsize();
            }
            catch {
                // Fallback
            }
        }
        return this.fallbackStore.size;
    }
    async flushall() {
        if (this.isConnected && this.redisClient) {
            try {
                await this.redisClient.flushall();
            }
            catch (err) {
                console.warn(`[Redis] Live FLUSHALL error: ${err.message}`);
            }
        }
        this.fallbackStore.clear();
        this.usedMemoryBytes = 0;
    }
    resetCounters() {
        this.hits = 0;
        this.misses = 0;
        this.adaptiveEvictions = 0;
        this.redisNativeEvictions = 0;
        this.refreshes = 0;
        this.preCaches = 0;
    }
    getStats() {
        const totalRequests = this.hits + this.misses;
        const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
        const totalEvictions = this.adaptiveEvictions + this.redisNativeEvictions;
        return {
            hits: this.hits,
            misses: this.misses,
            evictions: totalEvictions,
            adaptiveEvictions: this.adaptiveEvictions,
            redisNativeEvictions: this.redisNativeEvictions,
            totalEvictions,
            refreshes: this.refreshes,
            preCaches: this.preCaches,
            totalKeys: this.fallbackStore.size,
            usedMemoryBytes: this.usedMemoryBytes,
            maxMemoryBytes: this.maxMemoryBytes,
            hitRate,
        };
    }
    /**
     * Real health verification via PING
     */
    async checkHealth() {
        const start = Date.now();
        if (this.redisClient) {
            try {
                await this.redisClient.ping();
                const latency = Date.now() - start;
                this.isConnected = true;
                return {
                    status: 'CONNECTED',
                    latencyMs: latency,
                    message: 'Redis live instance connected and responding',
                };
            }
            catch (err) {
                this.isConnected = false;
                return {
                    status: 'DEGRADED',
                    latencyMs: Date.now() - start,
                    message: `Redis live ping failed: ${err.message}`,
                };
            }
        }
        return {
            status: 'OFFLINE',
            latencyMs: 0,
            message: 'REDIS_URL not configured. Operating in high-speed integrated Redis Cache Engine.',
        };
    }
}
exports.RedisCacheService = RedisCacheService;
exports.redisCache = new RedisCacheService();
