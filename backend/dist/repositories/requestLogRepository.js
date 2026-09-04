"use strict";
/**
 * Request Log Repository
 * Stores and queries audit trails of all incoming requests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogRepository = exports.RequestLogRepository = void 0;
const client_1 = require("../database/client");
const db_1 = require("../db");
class RequestLogRepository {
    fallbackLogs = [];
    maxMemoryLogs = 20000;
    /**
     * Log an incoming request
     */
    async log(log) {
        this.fallbackLogs.push(log);
        db_1.db.logRequest(log);
        if (this.fallbackLogs.length > this.maxMemoryLogs) {
            this.fallbackLogs.splice(0, 5000);
        }
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query(`INSERT INTO request_logs (
            request_id, timestamp, object_id, operation, response_size_bytes,
            cache_hit, backend_called, backend_latency_ms, cache_latency_ms,
            total_latency_ms, status_code, error_message, was_coalesced, strategy_used
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (request_id) DO NOTHING`, [
                    log.requestId,
                    log.timestamp,
                    log.objectId,
                    log.operation || 'GET',
                    log.responseSizeBytes || 0,
                    log.cacheHit,
                    log.backendCalled ?? !log.cacheHit,
                    log.backendLatencyMs || 0,
                    log.cacheLatencyMs || 0,
                    log.totalLatencyMs || 0,
                    log.statusCode || 200,
                    log.errorMessage || null,
                    log.wasCoalesced || false,
                    log.strategyUsed || 'ADAPTIVE',
                ]);
            }
            catch (err) {
                console.warn(`[RequestLogRepo] DB log error:`, err.message);
            }
        }
    }
    /**
     * Get recent request logs with optional mode filter
     */
    async getRecent(limit = 100, modeFilter) {
        if (client_1.dbClient.isConnected) {
            try {
                let query = `SELECT request_id, timestamp, object_id, operation, response_size_bytes,
                            cache_hit, backend_called, backend_latency_ms, cache_latency_ms,
                            total_latency_ms, status_code, error_message, was_coalesced, strategy_used
                     FROM request_logs`;
                const params = [];
                if (modeFilter === 'demo') {
                    query += ` WHERE object_id LIKE 'DEMO-%'`;
                }
                else if (modeFilter === 'live') {
                    query += ` WHERE object_id NOT LIKE 'DEMO-%'`;
                }
                query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
                params.push(limit);
                const res = await client_1.dbClient.query(query, params);
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
                    source: row.object_id.startsWith('DEMO-') ? 'demo' : 'live',
                    mode: row.object_id.startsWith('DEMO-') ? 'demo' : 'live',
                }));
            }
            catch (err) {
                console.warn(`[RequestLogRepo] DB query error:`, err.message);
            }
        }
        let logs = this.fallbackLogs;
        if (modeFilter === 'demo') {
            logs = logs.filter(l => l.source === 'demo' || l.objectId.startsWith('DEMO-'));
        }
        else if (modeFilter === 'live') {
            logs = logs.filter(l => l.source !== 'demo' && !l.objectId.startsWith('DEMO-'));
        }
        return logs.slice(-limit).reverse();
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
                await client_1.dbClient.query(`DELETE FROM request_logs WHERE object_id LIKE 'DEMO-%'`);
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
