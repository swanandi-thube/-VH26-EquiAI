/**
 * Request Log Repository
 * Stores and queries audit trails of all incoming requests.
 */

import { dbClient } from '../database/client';
import { db } from '../db';
import { RequestLog } from '../types';

export class RequestLogRepository {
  private fallbackLogs: RequestLog[] = [];
  private maxMemoryLogs: number = 20000;

  /**
   * Log an incoming request
   */
  public async log(log: RequestLog): Promise<void> {
    this.fallbackLogs.push(log);
    db.logRequest(log);
    if (this.fallbackLogs.length > this.maxMemoryLogs) {
      this.fallbackLogs.splice(0, 5000);
    }

    if (dbClient.isConnected) {
      try {
        await dbClient.query(
          `INSERT INTO request_logs (
            request_id, timestamp, object_id, operation, response_size_bytes,
            cache_hit, backend_called, backend_latency_ms, cache_latency_ms,
            total_latency_ms, status_code, error_message, was_coalesced, strategy_used
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (request_id) DO NOTHING`,
          [
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
          ]
        );
      } catch (err: any) {
        console.warn(`[RequestLogRepo] DB log error:`, err.message);
      }
    }
  }

  /**
   * Get recent request logs
   */
  public async getRecent(limit = 100): Promise<RequestLog[]> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query(
          `SELECT request_id, timestamp, object_id, operation, response_size_bytes,
                  cache_hit, backend_called, backend_latency_ms, cache_latency_ms,
                  total_latency_ms, status_code, error_message, was_coalesced, strategy_used
           FROM request_logs
           ORDER BY timestamp DESC
           LIMIT $1`,
          [limit]
        );
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
        }));
      } catch (err: any) {
        console.warn(`[RequestLogRepo] DB query error:`, err.message);
      }
    }

    return this.fallbackLogs.slice(-limit).reverse();
  }

  public getAll(): RequestLog[] {
    return this.fallbackLogs;
  }
}

export const requestLogRepository = new RequestLogRepository();
