"use strict";
/**
 * Request Log & Cache Access Repository
 * Stores and queries audit trails of all incoming requests and cache accesses in PostgreSQL.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogRepository = exports.RequestLogRepository = void 0;
const client_1 = require("../database/client");
const commodityCatalog_1 = require("../database/commodityCatalog");
const db_1 = require("../db");
class RequestLogRepository {
    fallbackLogs = [];
    maxMemoryLogs = 20000;
    constructor() {
        this.seedFallbackHistoricalLogs();
    }
    seedFallbackHistoricalLogs() {
        const now = Date.now();
        for (let i = 0; i < 20; i++) {
            const item = commodityCatalog_1.COMMODITY_CATALOG[i % commodityCatalog_1.COMMODITY_CATALOG.length];
            const isHit = i % 2 === 0;
            const pastTime = now - ((25 - i) * 1800000); // every 30 mins
            const log = {
                requestId: `HIST-REQ-${String(i + 1).padStart(4, '0')}`,
                timestamp: pastTime,
                objectId: item.objectId,
                operation: 'GET',
                responseSizeBytes: item.sizeBytes,
                cacheHit: isHit,
                backendCalled: !isHit,
                backendLatencyMs: isHit ? 0 : item.baseRetrievalCostMs,
                cacheLatencyMs: 1,
                totalLatencyMs: isHit ? 1 : item.baseRetrievalCostMs + 1,
                statusCode: 200,
                wasCoalesced: false,
                strategyUsed: 'ADAPTIVE',
                source: 'seeded_demo',
                mode: 'historical',
            };
            this.fallbackLogs.push(log);
        }
    }
    /**
     * Log an incoming request and cache access record
     */
    async log(log) {
        const source = log.source || (log.objectId?.startsWith('DEMO-') ? 'demo' : 'live');
        const mode = log.mode || (log.objectId?.startsWith('DEMO-') ? 'demo' : 'live');
        const fullLog = {
            ...log,
            source,
            mode,
        };
        this.fallbackLogs.push(fullLog);
        db_1.db.logRequest(fullLog);
        if (this.fallbackLogs.length > this.maxMemoryLogs) {
            this.fallbackLogs.splice(0, 5000);
        }
        if (client_1.dbClient.isConnected) {
            try {
                // 1. Insert into request_logs
                await client_1.dbClient.query(`INSERT INTO request_logs (
            request_id, timestamp, object_id, operation, response_size_bytes,
            cache_hit, backend_called, backend_latency_ms, cache_latency_ms,
            total_latency_ms, status_code, error_message, was_coalesced, strategy_used,
            source, mode
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (request_id) DO NOTHING`, [
                    fullLog.requestId,
                    fullLog.timestamp,
                    fullLog.objectId,
                    fullLog.operation || 'GET',
                    fullLog.responseSizeBytes || 0,
                    fullLog.cacheHit,
                    fullLog.backendCalled ?? !fullLog.cacheHit,
                    fullLog.backendLatencyMs || 0,
                    fullLog.cacheLatencyMs || 0,
                    fullLog.totalLatencyMs || 0,
                    fullLog.statusCode || 200,
                    fullLog.errorMessage || null,
                    fullLog.wasCoalesced || false,
                    fullLog.strategyUsed || 'ADAPTIVE',
                    source,
                    mode,
                ]);
                // 2. Insert into cache_accesses table
                await client_1.dbClient.query(`INSERT INTO cache_accesses (object_id, accessed_at, latency_ms, cache_hit, source)
           VALUES ($1, TO_TIMESTAMP($2 / 1000.0), $3, $4, $5)`, [
                    fullLog.objectId,
                    fullLog.timestamp,
                    fullLog.totalLatencyMs,
                    fullLog.cacheHit,
                    source,
                ]);
            }
            catch (err) {
                console.warn(`[RequestLogRepo] DB log error:`, err.message);
            }
        }
    }
    /**
     * Get recent request logs with optional mode/source filter
     */
    async getRecent(limit = 100, modeFilter) {
        if (client_1.dbClient.isConnected) {
            try {
                let query = `SELECT request_id, timestamp, object_id, operation, response_size_bytes,
                            cache_hit, backend_called, backend_latency_ms, cache_latency_ms,
                            total_latency_ms, status_code, error_message, was_coalesced, strategy_used,
                            source, mode
                     FROM request_logs`;
                const params = [];
                if (modeFilter === 'demo') {
                    query += ` WHERE source = 'demo' OR object_id LIKE 'DEMO-%'`;
                }
                else if (modeFilter === 'seeded_demo') {
                    query += ` WHERE source = 'seeded_demo'`;
                }
                else if (modeFilter === 'live') {
                    query += ` WHERE source = 'live' AND object_id NOT LIKE 'DEMO-%'`;
                }
                query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
                params.push(limit);
                const res = await client_1.dbClient.query(query, params);
                if (res.rows.length > 0) {
                    return res.rows.map(row => ({
                        requestId: row.request_id,
                        timestamp: Number(row.timestamp),
                        objectId: row.object_id,
                        operation: row.operation,
                        responseSizeBytes: parseInt(row.response_size_bytes, 10),
                        cacheHit: row.cache_hit,
                        backendCalled: row.backend_called,
                        backendLatencyMs: parseInt(row.backend_latency_ms, 10),
                        cacheLatencyMs: parseInt(row.cache_latency_ms, 10) || 0,
                        totalLatencyMs: parseInt(row.total_latency_ms, 10),
                        statusCode: parseInt(row.status_code, 10),
                        errorMessage: row.error_message,
                        wasCoalesced: row.was_coalesced,
                        strategyUsed: row.strategy_used,
                        source: row.source || (row.object_id.startsWith('DEMO-') ? 'demo' : 'live'),
                        mode: row.mode || 'live',
                    }));
                }
            }
            catch (err) {
                console.warn(`[RequestLogRepo] DB query error:`, err.message);
            }
        }
        let logs = this.fallbackLogs;
        if (modeFilter === 'demo') {
            logs = logs.filter(l => l.source === 'demo' || l.objectId.startsWith('DEMO-'));
        }
        else if (modeFilter === 'seeded_demo') {
            logs = logs.filter(l => l.source === 'seeded_demo');
        }
        else if (modeFilter === 'live') {
            logs = logs.filter(l => l.source === 'live' && !l.objectId.startsWith('DEMO-'));
        }
        return logs.slice(-limit).reverse();
    }
    /**
     * Get operational metrics breakdown: live vs historical vs total
     */
    async getMetricsBreakdown() {
        const computeStats = (logs) => {
            const total = logs.length;
            if (total === 0) {
                return {
                    totalRequests: 0,
                    cacheHits: 0,
                    cacheMisses: 0,
                    hitRate: 0,
                    backendRequests: 0,
                    avgLatencyMs: 0,
                    p95LatencyMs: 0,
                    p99LatencyMs: 0,
                };
            }
            const hits = logs.filter(l => l.cacheHit).length;
            const misses = total - hits;
            const backendRequests = logs.filter(l => l.backendCalled || !l.cacheHit).length;
            const latencies = logs.map(l => l.totalLatencyMs).sort((a, b) => a - b);
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            const p95 = latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1];
            const p99 = latencies[Math.floor(latencies.length * 0.99)] || latencies[latencies.length - 1];
            return {
                totalRequests: total,
                cacheHits: hits,
                cacheMisses: misses,
                hitRate: Math.round((hits / total) * 1000) / 1000,
                backendRequests,
                avgLatencyMs: Math.round(avg * 10) / 10,
                p95LatencyMs: Math.round(p95 * 10) / 10,
                p99LatencyMs: Math.round(p99 * 10) / 10,
            };
        };
        let allLogs = [];
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT request_id, timestamp, object_id, cache_hit, backend_called,
                  backend_latency_ms, cache_latency_ms, total_latency_ms, status_code, source
           FROM request_logs ORDER BY timestamp DESC LIMIT 5000`);
                allLogs = res.rows.map(r => ({
                    requestId: r.request_id,
                    timestamp: Number(r.timestamp),
                    objectId: r.object_id,
                    operation: 'GET',
                    responseSizeBytes: 0,
                    cacheHit: r.cache_hit,
                    backendCalled: r.backend_called,
                    backendLatencyMs: parseInt(r.backend_latency_ms, 10),
                    cacheLatencyMs: parseInt(r.cache_latency_ms, 10) || 0,
                    totalLatencyMs: parseInt(r.total_latency_ms, 10),
                    statusCode: parseInt(r.status_code, 10),
                    source: r.source || 'live',
                }));
            }
            catch (err) {
                allLogs = this.fallbackLogs;
            }
        }
        else {
            allLogs = this.fallbackLogs;
        }
        const liveLogs = allLogs.filter(l => l.source === 'live');
        const histLogs = allLogs.filter(l => l.source === 'seeded_demo');
        return {
            live: computeStats(liveLogs),
            historical: computeStats(histLogs),
            total: computeStats(allLogs),
        };
    }
    /**
     * Clears ONLY demo request logs, leaving live data completely untouched.
     */
    async clearDemoLogs() {
        const beforeCount = this.fallbackLogs.length;
        this.fallbackLogs = this.fallbackLogs.filter(l => l.source !== 'demo' && !l.objectId.startsWith('DEMO-'));
        const deletedCount = beforeCount - this.fallbackLogs.length;
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query(`DELETE FROM request_logs WHERE object_id LIKE 'DEMO-%' OR source = 'demo'`);
            }
            catch (err) {
                console.warn(`[RequestLogRepo] DB clearDemoLogs error:`, err.message);
            }
        }
        return deletedCount;
    }
    getAll() {
        return this.fallbackLogs;
    }
}
exports.RequestLogRepository = RequestLogRepository;
exports.requestLogRepository = new RequestLogRepository();
