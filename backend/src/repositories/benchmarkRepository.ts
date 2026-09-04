/**
 * Benchmark Repository
 * Stores and queries multi-strategy benchmark runs with reproducibility and fairness validation.
 */

import { dbClient } from '../database/client';
import { db } from '../db';
import { BenchmarkRun } from '../types';

export class BenchmarkRepository {
  private memoryRuns: Map<string, BenchmarkRun> = new Map();

  /**
   * Save a completed benchmark run
   */
  public async saveRun(run: BenchmarkRun): Promise<void> {
    this.memoryRuns.set(run.id, run);
    db.saveBenchmarkRun(run);

    if (dbClient.isConnected) {
      try {
        await dbClient.query(
          `INSERT INTO benchmark_runs (
            id, trace_id, trace_name, total_requests_in_trace,
            cache_capacity_bytes, is_trace_verified_fair, fairness_details,
            results, started_at, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            results = EXCLUDED.results,
            completed_at = EXCLUDED.completed_at`,
          [
            run.id,
            run.traceId,
            run.traceName,
            run.totalRequestsInTrace,
            run.cacheCapacityBytes,
            run.isTraceVerifiedFair,
            JSON.stringify(run.fairnessDetails),
            JSON.stringify(run.results),
            run.startedAt,
            run.completedAt,
          ]
        );
      } catch (err: any) {
        console.warn(`[BenchmarkRepo] DB saveRun error:`, err.message);
      }
    }
  }

  /**
   * Get a benchmark run by ID
   */
  public async getRunById(id: string): Promise<BenchmarkRun | null> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query(
          `SELECT id, trace_id, trace_name, total_requests_in_trace,
                  cache_capacity_bytes, is_trace_verified_fair, fairness_details,
                  results, started_at, completed_at
           FROM benchmark_runs
           WHERE id = $1`,
          [id]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            traceId: row.trace_id,
            traceName: row.trace_name,
            totalRequestsInTrace: row.total_requests_in_trace,
            cacheCapacityBytes: Number(row.cache_capacity_bytes),
            isTraceVerifiedFair: row.is_trace_verified_fair,
            fairnessDetails: typeof row.fairness_details === 'string' ? JSON.parse(row.fairness_details) : row.fairness_details,
            results: typeof row.results === 'string' ? JSON.parse(row.results) : row.results,
            startedAt: Number(row.started_at),
            completedAt: Number(row.completed_at),
          };
        }
      } catch (err: any) {
        console.warn(`[BenchmarkRepo] DB getRunById error:`, err.message);
      }
    }

    return this.memoryRuns.get(id) || db.getBenchmarkRun(id) || null;
  }

  /**
   * Get all historical benchmark runs
   */
  public async getAllRuns(): Promise<BenchmarkRun[]> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query(
          `SELECT id, trace_id, trace_name, total_requests_in_trace,
                  cache_capacity_bytes, is_trace_verified_fair, fairness_details,
                  results, started_at, completed_at
           FROM benchmark_runs
           ORDER BY started_at DESC
           LIMIT 50`
        );
        if (res.rows.length > 0) {
          return res.rows.map((row) => ({
            id: row.id,
            traceId: row.trace_id,
            traceName: row.trace_name,
            totalRequestsInTrace: row.total_requests_in_trace,
            cacheCapacityBytes: Number(row.cache_capacity_bytes),
            isTraceVerifiedFair: row.is_trace_verified_fair,
            fairnessDetails: typeof row.fairness_details === 'string' ? JSON.parse(row.fairness_details) : row.fairness_details,
            results: typeof row.results === 'string' ? JSON.parse(row.results) : row.results,
            startedAt: Number(row.started_at),
            completedAt: Number(row.completed_at),
          }));
        }
      } catch (err: any) {
        console.warn(`[BenchmarkRepo] DB getAllRuns error:`, err.message);
      }
    }

    const runs = Array.from(this.memoryRuns.values());
    if (runs.length === 0) {
      return db.getAllBenchmarkRuns();
    }
    return runs.sort((a, b) => b.startedAt - a.startedAt);
  }
}

export const benchmarkRepository = new BenchmarkRepository();
