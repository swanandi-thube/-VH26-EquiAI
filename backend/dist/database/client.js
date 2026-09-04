"use strict";
/**
 * PostgreSQL Database Client & Connection Pool Manager
 * Supabase-compatible parameterized query interface with health telemetry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbClient = exports.DatabaseClient = void 0;
const pg_1 = require("pg");
const config_1 = require("../config");
class DatabaseClient {
    pool = null;
    isConnected = false;
    maxPoolSize = 20;
    activeConnections = 0;
    connectionQueueDepth = 0;
    constructor() {
        this.initPool();
    }
    initPool() {
        if (config_1.config.databaseUrl) {
            try {
                this.pool = new pg_1.Pool({
                    connectionString: config_1.config.databaseUrl,
                    connectionTimeoutMillis: 5000,
                    idleTimeoutMillis: 30000,
                    max: this.maxPoolSize,
                    ssl: config_1.config.databaseUrl.includes('supabase') || config_1.config.databaseUrl.includes('sslmode=require')
                        ? { rejectUnauthorized: false }
                        : undefined,
                });
                this.pool.on('error', (err) => {
                    console.error('[Database Pool Error]:', err.message);
                });
                console.log('[Database] PostgreSQL connection pool initialized with DATABASE_URL.');
            }
            catch (err) {
                console.warn('[Database] Failed to initialize PostgreSQL pool:', err.message);
                this.pool = null;
            }
        }
        else {
            console.log('[Database] No DATABASE_URL provided. Operating with in-memory relational store fallback.');
        }
    }
    /**
     * Execute a parameterized SQL query
     */
    async query(text, params) {
        const startTime = Date.now();
        this.activeConnections = Math.min(this.maxPoolSize, this.activeConnections + 1);
        if (!this.pool) {
            this.activeConnections = Math.max(0, this.activeConnections - 1);
            throw new Error('Database pool not initialized. DATABASE_URL is not set.');
        }
        try {
            const result = await this.pool.query(text, params);
            return result;
        }
        finally {
            this.activeConnections = Math.max(0, this.activeConnections - 1);
        }
    }
    /**
     * Get a dedicated client from the pool
     */
    async getClient() {
        if (!this.pool)
            return null;
        return await this.pool.connect();
    }
    /**
     * Get connection pool metrics
     */
    getMetrics() {
        return {
            activeConnections: this.activeConnections,
            maxPoolSize: this.maxPoolSize,
            connectionQueueDepth: this.connectionQueueDepth,
            utilization: this.maxPoolSize > 0 ? this.activeConnections / this.maxPoolSize : 0,
            totalCount: this.pool?.totalCount || 0,
            idleCount: this.pool?.idleCount || 0,
            waitingCount: this.pool?.waitingCount || 0,
        };
    }
    /**
     * Real health verification via SELECT 1
     */
    async checkHealth() {
        const start = Date.now();
        if (!this.pool) {
            return {
                status: 'OFFLINE',
                latencyMs: 0,
                message: 'DATABASE_URL not configured. Operating in in-memory relational store mode.',
            };
        }
        try {
            const client = await this.pool.connect();
            try {
                await client.query('SELECT 1');
                const latency = Date.now() - start;
                this.isConnected = true;
                return {
                    status: 'CONNECTED',
                    latencyMs: latency,
                    message: 'PostgreSQL connection pool healthy (Supabase compatible)',
                };
            }
            finally {
                client.release();
            }
        }
        catch (err) {
            this.isConnected = false;
            return {
                status: 'DEGRADED',
                latencyMs: Date.now() - start,
                message: `PostgreSQL connection probe failed: ${err.message}`,
            };
        }
    }
    /**
     * Close pool on shutdown
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isConnected = false;
        }
    }
}
exports.DatabaseClient = DatabaseClient;
exports.dbClient = new DatabaseClient();
