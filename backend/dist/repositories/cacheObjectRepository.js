"use strict";
/**
 * Generic Cache Object Repository
 * Supports PostgreSQL with parameterized queries and in-memory fallback.
 * Uses realistic 32-commodity product catalog as fallback and seed dataset.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheObjectRepository = exports.CacheObjectRepository = void 0;
const client_1 = require("../database/client");
const commodityCatalog_1 = require("../database/commodityCatalog");
class CacheObjectRepository {
    fallbackStore = new Map();
    constructor() {
        this.seedFallbackCatalog();
    }
    /**
     * Find object by generic object_id
     */
    async findById(objectId) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query('SELECT object_id, key, name, category, payload, size_bytes, base_retrieval_cost_ms, compute_complexity, EXTRACT(EPOCH FROM created_at)*1000 AS created_at, EXTRACT(EPOCH FROM updated_at)*1000 AS updated_at FROM cache_objects WHERE object_id = $1', [objectId]);
                if (res.rows.length > 0) {
                    const row = res.rows[0];
                    return {
                        objectId: row.object_id,
                        key: row.key,
                        name: row.name,
                        category: row.category,
                        payload: row.payload,
                        sizeBytes: parseInt(row.size_bytes, 10),
                        baseRetrievalCostMs: parseInt(row.base_retrieval_cost_ms, 10),
                        computeComplexity: parseInt(row.compute_complexity, 10) || 1,
                        createdAt: Number(row.created_at),
                        updatedAt: Number(row.updated_at),
                    };
                }
            }
            catch (err) {
                console.warn(`[CacheObjectRepo] DB query failed (${err.message}). Using fallback store.`);
            }
        }
        return this.fallbackStore.get(objectId) || null;
    }
    /**
     * Save or update an object
     */
    async save(entity) {
        this.fallbackStore.set(entity.objectId, entity);
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query(`INSERT INTO cache_objects (object_id, key, name, category, payload, size_bytes, base_retrieval_cost_ms, compute_complexity, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (object_id) DO UPDATE SET
             name = EXCLUDED.name,
             category = EXCLUDED.category,
             payload = EXCLUDED.payload,
             size_bytes = EXCLUDED.size_bytes,
             base_retrieval_cost_ms = EXCLUDED.base_retrieval_cost_ms,
             compute_complexity = EXCLUDED.compute_complexity,
             updated_at = NOW()`, [
                    entity.objectId,
                    entity.key || `cache:obj:${entity.objectId}`,
                    entity.name,
                    entity.category || 'General',
                    JSON.stringify(entity.payload),
                    entity.sizeBytes,
                    entity.baseRetrievalCostMs,
                    entity.computeComplexity || 1,
                ]);
            }
            catch (err) {
                console.warn(`[CacheObjectRepo] DB save error:`, err.message);
            }
        }
    }
    /**
     * Get all objects with limit and offset
     */
    async findAll(limit = 100, offset = 0) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query('SELECT object_id, key, name, category, payload, size_bytes, base_retrieval_cost_ms, compute_complexity, EXTRACT(EPOCH FROM created_at)*1000 AS created_at, EXTRACT(EPOCH FROM updated_at)*1000 AS updated_at FROM cache_objects ORDER BY object_id LIMIT $1 OFFSET $2', [limit, offset]);
                if (res.rows.length > 0) {
                    return res.rows.map(row => ({
                        objectId: row.object_id,
                        key: row.key,
                        name: row.name,
                        category: row.category,
                        payload: row.payload,
                        sizeBytes: parseInt(row.size_bytes, 10),
                        baseRetrievalCostMs: parseInt(row.base_retrieval_cost_ms, 10),
                        computeComplexity: parseInt(row.compute_complexity, 10) || 1,
                        createdAt: Number(row.created_at),
                        updatedAt: Number(row.updated_at),
                    }));
                }
            }
            catch (err) {
                console.warn(`[CacheObjectRepo] DB list error:`, err.message);
            }
        }
        const all = Array.from(this.fallbackStore.values());
        return all.slice(offset, offset + limit);
    }
    /**
     * Count total stored entities
     */
    async count() {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query('SELECT COUNT(*) AS total FROM cache_objects');
                return parseInt(res.rows[0].total, 10);
            }
            catch {
                // Fallback
            }
        }
        return this.fallbackStore.size;
    }
    /**
     * Seeds realistic commodity catalog into memory store
     */
    seedFallbackCatalog() {
        const now = Date.now();
        for (let i = 0; i < commodityCatalog_1.COMMODITY_CATALOG.length; i++) {
            const item = commodityCatalog_1.COMMODITY_CATALOG[i];
            const entity = {
                objectId: item.objectId,
                key: `cache:obj:${item.objectId}`,
                name: item.name,
                category: item.category,
                payload: {
                    id: item.objectId,
                    name: item.name,
                    category: item.category,
                    location: item.location,
                    price: item.price,
                    previousPrice: item.previousPrice,
                    priceChangePct: item.priceChangePct,
                    unit: item.unit,
                    specs: item.specs,
                    description: item.description,
                    source: 'postgresql_origin',
                    updatedAt: now - (i * 60000),
                },
                sizeBytes: item.sizeBytes,
                baseRetrievalCostMs: item.baseRetrievalCostMs,
                computeComplexity: item.computeComplexity,
                createdAt: now - (i * 60000),
                updatedAt: now - (i * 60000),
            };
            this.fallbackStore.set(item.objectId, entity);
        }
    }
}
exports.CacheObjectRepository = CacheObjectRepository;
exports.cacheObjectRepository = new CacheObjectRepository();
