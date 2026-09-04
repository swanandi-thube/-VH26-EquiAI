"use strict";
/**
 * Benchmark Repository
 * Stores and queries multi-strategy benchmark runs with reproducibility and fairness validation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.benchmarkRepository = exports.BenchmarkRepository = void 0;
const client_1 = require("../database/client");
const db_1 = require("../db");
class BenchmarkRepository {
    memoryRuns = new Map();
    /**
     * Save a completed benchmark run
     */
    async saveRun(run) {
        this.memoryRuns.set(run.id, run);
        db_1.db.saveBenchmarkRun(run);
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query(`INSERT INTO benchmark_runs (
            id, trace_id, trace_name, total_requests_in_trace,
            cache_capacity_bytes, is_trace_verified_fair, fairness_details,
            results, started_at, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            results = EXCLUDED.results,
            completed_at = EXCLUDED.completed_at`, [
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
                ]);
            }
            catch (err) {
                console.warn(`[BenchmarkRepo] DB saveRun error:`, err.message);
            }
        }
    }
    /**
     * Get a benchmark run by ID
     */
    async getRunById(id) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT id, trace_id, trace_name, total_requests_in_trace,
                  cache_capacity_bytes, is_trace_verified_fair, fairness_details,
                  results, started_at, completed_at
           FROM benchmark_runs
           WHERE id = $1`, [id]);
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
            }
            catch (err) {
                console.warn(`[BenchmarkRepo] DB getRunById error:`, err.message);
            }
        }
        return this.memoryRuns.get(id) || db_1.db.getBenchmarkRun(id) || null;
    }
    /**
     * Get all historical benchmark runs
     */
    async getAllRuns() {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT id, trace_id, trace_name, total_requests_in_trace,
                  cache_capacity_bytes, is_trace_verified_fair, fairness_details,
                  results, started_at, completed_at
           FROM benchmark_runs
           ORDER BY started_at DESC
           LIMIT 50`);
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
            }
            catch (err) {
                console.warn(`[BenchmarkRepo] DB getAllRuns error:`, err.message);
            }
        }
        const runs = Array.from(this.memoryRuns.values());
        if (runs.length === 0) {
            return db_1.db.getAllBenchmarkRuns();
        }
        return runs.sort((a, b) => b.startedAt - a.startedAt);
    }
}
exports.BenchmarkRepository = BenchmarkRepository;
exports.benchmarkRepository = new BenchmarkRepository();
