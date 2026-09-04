"use strict";
/**
 * Workload & Traffic Lab Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workloadController = exports.WorkloadController = void 0;
const generator_1 = require("../workload/generator");
const workloadIngestionService_1 = require("../services/workloadIngestionService");
const workloadRepository_1 = require("../repositories/workloadRepository");
class WorkloadController {
    /**
     * POST /api/workloads/upload (multipart/form-data or JSON body)
     */
    async uploadWorkload(req, res) {
        try {
            let filename = 'custom_trace.csv';
            let contentBuffer = null;
            let sizeBytes = 0;
            // 1. Check if uploaded via multer (multipart/form-data)
            if (req.file) {
                filename = req.file.originalname || filename;
                contentBuffer = req.file.buffer;
                sizeBytes = req.file.size || req.file.buffer.length;
            }
            else if (req.body && req.body.content) {
                // Direct JSON payload with content string
                filename = req.body.filename || filename;
                contentBuffer = req.body.content;
                sizeBytes = Buffer.byteLength(req.body.content, 'utf8');
            }
            else if (req.body && Array.isArray(req.body.requests)) {
                // Direct JSON array of requests
                filename = req.body.filename || 'custom_trace.json';
                contentBuffer = JSON.stringify(req.body.requests);
                sizeBytes = Buffer.byteLength(contentBuffer, 'utf8');
            }
            else if (req.body && Array.isArray(req.body)) {
                // Raw array
                filename = 'custom_trace.json';
                contentBuffer = JSON.stringify(req.body);
                sizeBytes = Buffer.byteLength(contentBuffer, 'utf8');
            }
            if (!contentBuffer) {
                res.status(400).json({
                    success: false,
                    message: 'No file or content provided. Please upload a CSV or JSON workload file via multipart/form-data with field "file".',
                });
                return;
            }
            const { summary } = await workloadIngestionService_1.workloadIngestionService.ingestFile(filename, contentBuffer, sizeBytes);
            res.status(200).json({
                success: true,
                data: {
                    workload_id: summary.workloadId,
                    workloadId: summary.workloadId,
                    filename: summary.filename,
                    file_type: summary.fileType,
                    file_size_bytes: summary.fileSizeBytes,
                    total_rows: summary.totalRows,
                    valid_rows: summary.validRows,
                    rejected_rows: summary.rejectedRows,
                    unique_objects: summary.uniqueObjects,
                    time_range: summary.timeRange,
                    status: summary.status,
                    validation_errors: summary.validationErrors,
                    uploaded_at: summary.uploadedAt,
                },
            });
        }
        catch (err) {
            console.error('[WorkloadController] Upload error:', err);
            res.status(500).json({
                success: false,
                message: `Workload ingestion failed: ${err.message}`,
            });
        }
    }
    /**
     * GET /api/workloads (historical uploaded workloads)
     */
    async getWorkloadRuns(req, res) {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
            const runs = await workloadRepository_1.workloadRepository.getAllWorkloadRuns(limit);
            res.json({
                success: true,
                data: runs,
            });
        }
        catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
    /**
     * GET /api/workloads/:id
     */
    async getWorkloadRunById(req, res) {
        try {
            const { id } = req.params;
            const run = await workloadRepository_1.workloadRepository.getWorkloadRunById(id);
            if (!run) {
                res.status(404).json({ success: false, message: `Workload run with ID "${id}" not found` });
                return;
            }
            const requests = await workloadRepository_1.workloadRepository.getWorkloadRequests(id, 200);
            res.json({
                success: true,
                data: {
                    summary: run,
                    requests,
                },
            });
        }
        catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
    /**
     * DELETE /api/workloads/:id
     */
    async deleteWorkloadRun(req, res) {
        try {
            const { id } = req.params;
            const deleted = await workloadRepository_1.workloadRepository.deleteWorkloadRun(id);
            res.json({
                success: deleted,
                message: deleted ? `Workload run "${id}" deleted.` : `Workload run "${id}" not found.`,
            });
        }
        catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
    async startWorkload(req, res) {
        const config = req.body;
        try {
            const run = await generator_1.workloadGenerator.startWorkload(config);
            res.json({
                success: true,
                data: run,
            });
        }
        catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
    async stopWorkload(req, res) {
        const stoppedRun = await generator_1.workloadGenerator.stopWorkload();
        res.json({
            success: true,
            data: stoppedRun,
        });
    }
    async getActiveWorkload(req, res) {
        const active = generator_1.workloadGenerator.getActiveRun();
        res.json({
            success: true,
            data: {
                isRunning: generator_1.workloadGenerator.isWorkloadRunning(),
                activeRun: active,
            },
        });
    }
}
exports.WorkloadController = WorkloadController;
exports.workloadController = new WorkloadController();
