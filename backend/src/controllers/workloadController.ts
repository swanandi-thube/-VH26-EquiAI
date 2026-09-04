/**
 * Workload & Traffic Lab Controller
 */

import { Request, Response } from 'express';
import { workloadGenerator } from '../workload/generator';
import { WorkloadConfig } from '../types';

export class WorkloadController {
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
