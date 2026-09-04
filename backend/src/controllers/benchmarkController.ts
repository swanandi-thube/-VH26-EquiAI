/**
 * Benchmark API Controller
 * Executes and serves fair reproducible digital-twin benchmarks across caching algorithms.
 */

import { Request, Response } from 'express';
import { benchmarkEngine } from '../benchmark/engine';
import { benchmarkRepository } from '../repositories';

export class BenchmarkController {
  public async runBenchmark(req: Request, res: Response): Promise<void> {
    try {
      const {
        workloadId,
        requestCount = 2000,
        objectCount = 150,
        capacityMb = 32,
        traceName = 'Standard Workload Trace',
      } = req.body;

      const capacityBytes = capacityMb * 1024 * 1024;

      let result;
      if (workloadId) {
        result = await benchmarkEngine.runBenchmarkFromWorkload(workloadId, capacityBytes);
      } else {
        const trace = benchmarkEngine.generateTrace(requestCount, objectCount);
        result = await benchmarkEngine.runBenchmark(trace, capacityBytes, traceName);
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  public async getBenchmarkRuns(req: Request, res: Response): Promise<void> {
    try {
      const runs = await benchmarkRepository.getAllRuns();
      res.json({
        success: true,
        data: runs,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  public async getBenchmarkRunById(req: Request, res: Response): Promise<void> {
    try {
      const run = await benchmarkRepository.getRunById(req.params.id);
      if (!run) {
        res.status(404).json({ success: false, message: 'Benchmark run not found' });
        return;
      }
      res.json({
        success: true,
        data: run,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

export const benchmarkController = new BenchmarkController();
