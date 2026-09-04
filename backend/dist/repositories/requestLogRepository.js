"use strict";
/**
 * Request Log Repository
 * Stores and queries audit trails of all incoming requests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogRepository = exports.RequestLogRepository = void 0;
const client_1 = require("../database/client");
class RequestLogRepository {
    fallbackLogs = [];
    maxMemoryLogs = 20000;
    /**
     * Log an incoming request
     */
    async log(log) {
        this.fallbackLogs.push(log);
        if (this.fallbackLogs.length > this.maxMemoryLogs) {
            this.fallbackLogs.splice(0, 5000);
        }
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query(`INSERT INTO request_logs (
            request_id, timestamp, object_id, operation, response_size_bytes,
            cache_hit, backend_latency_ms, total_latency_ms, status_code,
            error_message, was_coalesced, strategy_used
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (request_id) DO NOTHING`, [
                    log.requestId,
                    log.timestamp,
                    log.objectId,
                    log.operation || 'GET',
                    log.responseSizeBytes || 0,
                    log.cacheHit,
                    log.backendLatencyMs || 0,
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
     * Get recent request logs
     */
    async getRecent(limit = 100) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT request_id, timestamp, object_id, operation, response_size_bytes,
                  cache_hit, backend_latency_ms, total_latency_ms, status_code,
                  error_message, was_coalesced, strategy_used
           FROM request_logs
           ORDER BY timestamp DESC
           LIMIT $1`, [limit]);
                return res.rows.map(row => ({
                    requestId: row.request_id,
                    timestamp: Number(row.timestamp),
                    objectId: row.object_id,
                    operation: row.operation,
                    responseSizeBytes: parseInt(row.response_size_bytes, 10),
                    cacheHit: row.cache_hit,
                    backendLatencyMs: parseInt(row.backend_latency_ms, 10),
                    totalLatencyMs: parseInt(row.total_latency_ms, 10),
                    statusCode: parseInt(row.status_code, 10),
                    errorMessage: row.error_message,
                    wasCoalesced: row.was_coalesced,
                    strategyUsed: row.strategy_used,
                }));
            }
            catch (err) {
                console.warn(`[RequestLogRepo] DB query error:`, err.message);
            }
        }
        return this.fallbackLogs.slice(-limit).reverse();
    }
    getAll() {
        return this.fallbackLogs;
    }
}
exports.RequestLogRepository = RequestLogRepository;
exports.requestLogRepository = new RequestLogRepository();
