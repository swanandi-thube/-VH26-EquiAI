/**
 * Benchmark API Controller
 */

import { Request, Response } from 'express';
import { benchmarkEngine } from '../benchmark/engine';
import { db } from '../db';

export class BenchmarkController {
  public async runBenchmark(req: Request, res: Response): Promise<void> {
    const { requestCount = 2000, objectCount = 150, capacityMb = 32, traceName = 'Standard Workload Trace' } = req.body;
    const capacityBytes = capacityMb * 1024 * 1024;

    const trace = benchmarkEngine.generateTrace(requestCount, objectCount);
    const result = await benchmarkEngine.runBenchmark(trace, capacityBytes, traceName);

    res.json({
      success: true,
      data: result,
    });
  }

  public async getBenchmarkRuns(req: Request, res: Response): Promise<void> {
    const runs = db.getAllBenchmarkRuns();
    res.json({
      success: true,
      data: runs,
    });
  }

  public async getBenchmarkRunById(req: Request, res: Response): Promise<void> {
    const run = db.getBenchmarkRun(req.params.id);
    if (!run) {
      res.status(404).json({ success: false, message: 'Benchmark run not found' });
      return;
    }
    res.json({
      success: true,
      data: run,
    });
  }
}

export const benchmarkController = new BenchmarkController();
