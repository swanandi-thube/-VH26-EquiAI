/**
 * Workload & Traffic Lab Controller
 */

import { Request, Response } from 'express';
import { workloadGenerator } from '../workload/generator';
import { workloadIngestionService } from '../services/workloadIngestionService';
import { workloadRepository } from '../repositories/workloadRepository';
import { WorkloadConfig } from '../types';

export class WorkloadController {
  /**
   * POST /api/workloads/upload (multipart/form-data or JSON body)
   */
  public async uploadWorkload(req: Request, res: Response): Promise<void> {
    try {
      let filename = 'custom_trace.csv';
      let contentBuffer: Buffer | string | null = null;
      let sizeBytes = 0;

      // 1. Check if uploaded via multer (multipart/form-data)
      if (req.file) {
        filename = req.file.originalname || filename;
        contentBuffer = req.file.buffer;
        sizeBytes = req.file.size || req.file.buffer.length;
      } else if (req.body && req.body.content) {
        // Direct JSON payload with content string
        filename = req.body.filename || filename;
        contentBuffer = req.body.content;
        sizeBytes = Buffer.byteLength(req.body.content, 'utf8');
      } else if (req.body && Array.isArray(req.body.requests)) {
        // Direct JSON array of requests
        filename = req.body.filename || 'custom_trace.json';
        contentBuffer = JSON.stringify(req.body.requests);
        sizeBytes = Buffer.byteLength(contentBuffer, 'utf8');
      } else if (req.body && Array.isArray(req.body)) {
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

      const { summary } = await workloadIngestionService.ingestFile(filename, contentBuffer, sizeBytes);

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
    } catch (err: any) {
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
  public async getWorkloadRuns(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const runs = await workloadRepository.getAllWorkloadRuns(limit);
      res.json({
        success: true,
        data: runs,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/workloads/:id
   */
  public async getWorkloadRunById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const run = await workloadRepository.getWorkloadRunById(id);
      if (!run) {
        res.status(404).json({ success: false, message: `Workload run with ID "${id}" not found` });
        return;
      }
      const requests = await workloadRepository.getWorkloadRequests(id, 200);
      res.json({
        success: true,
        data: {
          summary: run,
          requests,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * DELETE /api/workloads/:id
   */
  public async deleteWorkloadRun(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await workloadRepository.deleteWorkloadRun(id);
      res.json({
        success: deleted,
        message: deleted ? `Workload run "${id}" deleted.` : `Workload run "${id}" not found.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async startWorkload(req: Request, res: Response): Promise<void> {
    const config: WorkloadConfig = req.body;
    try {
      const run = await workloadGenerator.startWorkload(config);
      res.json({
        success: true,
        data: run,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async stopWorkload(req: Request, res: Response): Promise<void> {
    const stoppedRun = await workloadGenerator.stopWorkload();
    res.json({
      success: true,
      data: stoppedRun,
    });
  }

  public async getActiveWorkload(req: Request, res: Response): Promise<void> {
    const active = workloadGenerator.getActiveRun();
    res.json({
      success: true,
      data: {
        isRunning: workloadGenerator.isWorkloadRunning(),
        activeRun: active,
      },
    });
  }
}

export const workloadController = new WorkloadController();

