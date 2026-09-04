"use strict";
/**
 * Generic Cache Object Repository
 * Supports PostgreSQL with parameterized queries and in-memory fallback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheObjectRepository = exports.CacheObjectRepository = void 0;
const client_1 = require("../database/client");
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
                    entity.key || `cache:${entity.objectId}`,
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
     * Seeds 500 diverse generic entities into memory catalog
     */
    seedFallbackCatalog() {
        const categories = [
            { name: 'Computing & Servers', prefix: 'SRV', costMin: 80, costMax: 350, sizeMin: 4096, sizeMax: 65536 },
            { name: 'AI & GPU Accelerators', prefix: 'GPU', costMin: 120, costMax: 480, sizeMin: 8192, sizeMax: 131072 },
            { name: 'Audio & Acoustics', prefix: 'AUD', costMin: 20, costMax: 90, sizeMin: 1024, sizeMax: 8192 },
            { name: 'Optical & Cameras', prefix: 'OPT', costMin: 40, costMax: 150, sizeMin: 2048, sizeMax: 16384 },
            { name: 'IoT & Sensors', prefix: 'IOT', costMin: 15, costMax: 60, sizeMin: 512, sizeMax: 4096 },
            { name: 'Networking & Mesh', prefix: 'NET', costMin: 50, costMax: 200, sizeMin: 2048, sizeMax: 12288 },
            { name: 'Database Appliances', prefix: 'DBA', costMin: 100, costMax: 400, sizeMin: 16384, sizeMax: 98304 },
            { name: 'Security Enclaves', prefix: 'SEC', costMin: 90, costMax: 320, sizeMin: 4096, sizeMax: 32768 },
            { name: 'Storage Arrays', prefix: 'STR', costMin: 60, costMax: 220, sizeMin: 8192, sizeMax: 49152 },
            { name: 'Developer Toolchains', prefix: 'DEV', costMin: 30, costMax: 110, sizeMin: 1024, sizeMax: 8192 },
        ];
        const adjectives = ['Quantum', 'Hyper', 'Nexus', 'Apex', 'Titan', 'Vortex', 'Synapse', 'Vector', 'Pulse', 'Cyber'];
        const nouns = ['Core', 'Matrix', 'Engine', 'Node', 'Switch', 'Cluster', 'Gateway', 'Module', 'Drive', 'Bridge'];
        let count = 0;
        for (let c = 0; c < categories.length; c++) {
            const cat = categories[c];
            for (let i = 1; i <= 50; i++) {
                count++;
                const objectId = `Product_${count}`;
                const adj = adjectives[(count * 3) % adjectives.length];
                const noun = nouns[(count * 7) % nouns.length];
                const name = `${adj} ${noun} ${cat.prefix}-${1000 + i}`;
                const sizeBytes = Math.floor(cat.sizeMin + ((count * 137) % (cat.sizeMax - cat.sizeMin)));
                const baseCost = Math.floor(cat.costMin + ((count * 73) % (cat.costMax - cat.costMin)));
                const price = parseFloat((49.99 + ((count * 31) % 4950)).toFixed(2));
                const entity = {
                    objectId,
                    key: `cache:${objectId}`,
                    name,
                    category: cat.name,
                    payload: {
                        id: objectId,
                        name,
                        sku: `SKU-${cat.prefix}-${1000 + i}`,
                        price,
                        specs: {
                            throughput: `${(count % 40) + 10} Gbps`,
                            mtbf: '2,500,000 hrs',
                            powerDrawWatts: (count % 250) + 45,
                        },
                    },
                    sizeBytes,
                    baseRetrievalCostMs: baseCost,
                    computeComplexity: Math.max(1, Math.floor(baseCost / 40)),
                    createdAt: Date.now() - (count * 100000),
                    updatedAt: Date.now() - (count * 100000),
                };
                this.fallbackStore.set(objectId, entity);
            }
        }
    }
}
exports.CacheObjectRepository = CacheObjectRepository;
exports.cacheObjectRepository = new CacheObjectRepository();
