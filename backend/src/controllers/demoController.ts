/**
 * Demo Controller for ADAPTIVECACHE
 * Provides REST endpoints for safe demo mode execution and isolation verification.
 */

import { Request, Response } from 'express';
import { demoService } from '../services/demoService';
import { DemoScenarioType } from '../services/demoFixtures';

export class DemoController {
  public async start(req: Request, res: Response): Promise<void> {
    try {
      const { scenario, multiplier, cacheCapacityBytes, simulatedLatencyMs, simulatedErrorRate } = req.body;
      const scenarioId: DemoScenarioType = scenario || 'BASIC_CACHE';

      const result = await demoService.start(scenarioId, {
        multiplier: multiplier ? parseInt(multiplier, 10) : undefined,
        cacheCapacityBytes: cacheCapacityBytes ? parseInt(cacheCapacityBytes, 10) : undefined,
        simulatedLatencyMs: simulatedLatencyMs !== undefined ? parseInt(simulatedLatencyMs, 10) : undefined,
        simulatedErrorRate: simulatedErrorRate !== undefined ? parseFloat(simulatedErrorRate) : undefined,
      });

      res.json({
        success: true,
        message: `Deterministic demo scenario "${result.scenarioTitle}" executed successfully`,
        data: result,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `Failed to execute demo scenario: ${err.message}`,
      });
    }
  }

  public stop(req: Request, res: Response): void {
    const result = demoService.stop();
    res.json({
      success: true,
      message: result.message,
    });
  }

  public async reset(req: Request, res: Response): Promise<void> {
    try {
      const result = await demoService.reset();
      res.json({
        success: true,
        message: 'Demo mode reset successfully. Only demo keys and records were removed.',
        data: result,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `Failed to reset demo mode: ${err.message}`,
      });
    }
  }

  public getStatus(req: Request, res: Response): void {
    const status = demoService.getStatus();
    res.json({
      success: true,
      data: status,
    });
  }

  public getScenarios(req: Request, res: Response): void {
    const scenarios = demoService.getScenarios();
    res.json({
      success: true,
      data: scenarios,
    });
  }
}

export const demoController = new DemoController();
