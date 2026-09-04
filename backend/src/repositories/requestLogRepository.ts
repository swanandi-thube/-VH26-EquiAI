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
   * Get recent request logs with optional mode filter
   */
  public async getRecent(limit = 100, modeFilter?: 'live' | 'demo'): Promise<RequestLog[]> {
    if (dbClient.isConnected) {
      try {
        let query = `SELECT request_id, timestamp, object_id, operation, response_size_bytes,
                            cache_hit, backend_called, backend_latency_ms, cache_latency_ms,
                            total_latency_ms, status_code, error_message, was_coalesced, strategy_used
                     FROM request_logs`;
        const params: any[] = [];
        if (modeFilter === 'demo') {
          query += ` WHERE object_id LIKE 'DEMO-%'`;
        } else if (modeFilter === 'live') {
          query += ` WHERE object_id NOT LIKE 'DEMO-%'`;
        }
        query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await dbClient.query(query, params);
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
      } catch (err: any) {
        console.warn(`[RequestLogRepo] DB query error:`, err.message);
      }
    }

    let logs = this.fallbackLogs;
    if (modeFilter === 'demo') {
      logs = logs.filter(l => l.source === 'demo' || l.objectId.startsWith('DEMO-'));
    } else if (modeFilter === 'live') {
      logs = logs.filter(l => l.source !== 'demo' && !l.objectId.startsWith('DEMO-'));
    }
    return logs.slice(-limit).reverse();
  }

  /**
   * Clears ONLY demo request logs, leaving live data completely untouched.
   */
  public async clearDemoLogs(): Promise<number> {
    const beforeCount = this.fallbackLogs.length;
    this.fallbackLogs = this.fallbackLogs.filter(l => l.source !== 'demo' && !l.objectId.startsWith('DEMO-'));
    const deletedCount = beforeCount - this.fallbackLogs.length;

    if (dbClient.isConnected) {
      try {
        await dbClient.query(`DELETE FROM request_logs WHERE object_id LIKE 'DEMO-%'`);
      } catch (err: any) {
        console.warn(`[RequestLogRepo] DB clearDemoLogs error:`, err.message);
      }
    }

    return deletedCount;
  }

  public getAll(): RequestLog[] {
    return this.fallbackLogs;
  }
}

export const requestLogRepository = new RequestLogRepository();
