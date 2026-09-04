"use strict";
/**
 * Workload Repository
 * Stores and retrieves historical uploaded workloads and their individual request traces.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workloadRepository = exports.WorkloadRepository = void 0;
const client_1 = require("../database/client");
class WorkloadRepository {
    fallbackRuns = new Map();
    fallbackRequests = new Map();
    /**
     * Save a newly ingested workload run and its request trace records
     */
    async saveWorkloadRun(summary, requests) {
        // 1. Fallback / Memory Store
        this.fallbackRuns.set(summary.workloadId, summary);
        this.fallbackRequests.set(summary.workloadId, [...requests]);
        // 2. PostgreSQL Store (if connected)
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query(`INSERT INTO workload_runs (
            id, filename, file_type, file_size_bytes, total_rows, valid_rows, rejected_rows,
            unique_objects, start_time, end_time, duration_seconds, status, validation_errors, uploaded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            valid_rows = EXCLUDED.valid_rows,
            rejected_rows = EXCLUDED.rejected_rows`, [
                    summary.workloadId,
                    summary.filename,
                    summary.fileType,
                    summary.fileSizeBytes,
                    summary.totalRows,
                    summary.validRows,
                    summary.rejectedRows,
                    summary.uniqueObjects,
                    summary.timeRange.start,
                    summary.timeRange.end,
                    summary.timeRange.durationSeconds,
                    summary.status,
                    JSON.stringify(summary.validationErrors),
                    summary.uploadedAt,
                ]);
                // Batch insert requests in chunks of 500
                const chunkSize = 500;
                for (let i = 0; i < requests.length; i += chunkSize) {
                    const chunk = requests.slice(i, i + chunkSize);
                    const valuePlaceholders = [];
                    const queryParams = [];
                    let paramIdx = 1;
                    for (let j = 0; j < chunk.length; j++) {
                        const req = chunk[j];
                        const rowIndex = i + j + 1;
                        valuePlaceholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                        queryParams.push(summary.workloadId, rowIndex, req.timestamp, req.requestId, req.objectId, req.operation || 'GET', req.responseSizeBytes || 0, req.backendLatencyMs || 0, req.regenerationCostMs || 0, req.statusCode || 200, req.ttl ?? null, req.contentType ?? null, req.priority ?? null, req.region ?? null, true, null);
                    }
                    if (valuePlaceholders.length > 0) {
                        await client_1.dbClient.query(`INSERT INTO workload_requests (
                workload_id, row_index, timestamp, request_id, object_id, operation,
                response_size, backend_latency, regeneration_cost, status_code,
                ttl, content_type, priority, region, is_valid, validation_error
              ) VALUES ${valuePlaceholders.join(', ')}`, queryParams);
                    }
                }
            }
            catch (err) {
                console.warn(`[WorkloadRepo] DB persistence error:`, err.message);
            }
        }
    }
    /**
     * Get workload run metadata by ID
     */
    async getWorkloadRunById(workloadId) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT id, filename, file_type, file_size_bytes, total_rows, valid_rows,
                  rejected_rows, unique_objects, start_time, end_time, duration_seconds,
                  status, validation_errors, uploaded_at
           FROM workload_runs
           WHERE id = $1`, [workloadId]);
                if (res.rows.length > 0) {
                    const row = res.rows[0];
                    return {
                        workloadId: row.id,
                        filename: row.filename,
                        fileType: row.file_type,
                        fileSizeBytes: parseInt(row.file_size_bytes, 10),
                        totalRows: parseInt(row.total_rows, 10),
                        validRows: parseInt(row.valid_rows, 10),
                        rejectedRows: parseInt(row.rejected_rows, 10),
                        uniqueObjects: parseInt(row.unique_objects, 10),
                        timeRange: {
                            start: Number(row.start_time),
                            end: Number(row.end_time),
                            durationSeconds: parseInt(row.duration_seconds, 10),
                        },
                        status: row.status,
                        validationErrors: typeof row.validation_errors === 'string'
                            ? JSON.parse(row.validation_errors)
                            : (row.validation_errors || []),
                        uploadedAt: Number(row.uploaded_at),
                    };
                }
            }
            catch (err) {
                console.warn(`[WorkloadRepo] DB fetch error:`, err.message);
            }
        }
        return this.fallbackRuns.get(workloadId) || null;
    }
    /**
     * Get all historical workload runs
     */
    async getAllWorkloadRuns(limit = 100) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT id, filename, file_type, file_size_bytes, total_rows, valid_rows,
                  rejected_rows, unique_objects, start_time, end_time, duration_seconds,
                  status, validation_errors, uploaded_at
           FROM workload_runs
           ORDER BY uploaded_at DESC
           LIMIT $1`, [limit]);
                return res.rows.map((row) => ({
                    workloadId: row.id,
                    filename: row.filename,
                    fileType: row.file_type,
                    fileSizeBytes: parseInt(row.file_size_bytes, 10),
                    totalRows: parseInt(row.total_rows, 10),
                    validRows: parseInt(row.valid_rows, 10),
                    rejectedRows: parseInt(row.rejected_rows, 10),
                    uniqueObjects: parseInt(row.unique_objects, 10),
                    timeRange: {
                        start: Number(row.start_time),
                        end: Number(row.end_time),
                        durationSeconds: parseInt(row.duration_seconds, 10),
                    },
                    status: row.status,
                    validationErrors: typeof row.validation_errors === 'string'
                        ? JSON.parse(row.validation_errors)
                        : (row.validation_errors || []),
                    uploadedAt: Number(row.uploaded_at),
                }));
            }
            catch (err) {
                console.warn(`[WorkloadRepo] DB getAll error:`, err.message);
            }
        }
        return Array.from(this.fallbackRuns.values())
            .sort((a, b) => b.uploadedAt - a.uploadedAt)
            .slice(0, limit);
    }
    /**
     * Get requests for a specific workload run
     */
    async getWorkloadRequests(workloadId, limit = 1000, offset = 0) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT request_id, timestamp, object_id, operation, response_size,
                  backend_latency, regeneration_cost, status_code, ttl,
                  content_type, priority, region
           FROM workload_requests
           WHERE workload_id = $1 AND is_valid = TRUE
           ORDER BY row_index ASC
           LIMIT $2 OFFSET $3`, [workloadId, limit, offset]);
                return res.rows.map((row) => ({
                    requestId: row.request_id,
                    timestamp: Number(row.timestamp),
                    objectId: row.object_id,
                    operation: row.operation,
                    responseSizeBytes: parseInt(row.response_size, 10),
                    backendLatencyMs: parseInt(row.backend_latency, 10),
                    regenerationCostMs: parseInt(row.regeneration_cost, 10),
                    statusCode: parseInt(row.status_code, 10),
                    ttl: row.ttl !== null ? parseInt(row.ttl, 10) : null,
                    contentType: row.content_type,
                    priority: row.priority !== null ? parseInt(row.priority, 10) : null,
                    region: row.region,
                }));
            }
            catch (err) {
                console.warn(`[WorkloadRepo] DB getRequests error:`, err.message);
            }
        }
        const requests = this.fallbackRequests.get(workloadId) || [];
        return requests.slice(offset, offset + limit);
    }
    /**
     * Delete workload and all its requests
     */
    async deleteWorkloadRun(workloadId) {
        this.fallbackRuns.delete(workloadId);
        this.fallbackRequests.delete(workloadId);
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query('DELETE FROM workload_runs WHERE id = $1', [workloadId]);
                return true;
            }
            catch (err) {
                console.warn(`[WorkloadRepo] DB delete error:`, err.message);
                return false;
            }
        }
        return true;
    }
}
exports.WorkloadRepository = WorkloadRepository;
exports.workloadRepository = new WorkloadRepository();
