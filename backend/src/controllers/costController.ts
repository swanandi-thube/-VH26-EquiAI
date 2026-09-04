/**
 * Cost & ROI Model API Controller
 */

import { Request, Response } from 'express';
import { costEngine } from '../engine/cost';
import { telemetry } from '../telemetry';
import { settingsRepository } from '../repositories';

export class CostController {
  public async getCost(req: Request, res: Response): Promise<void> {
    const snapshot = telemetry.getSnapshot();
    const settings = await settingsRepository.getSettings();

    const costBreakdown = costEngine.calculateCost(
      {
        totalRequestsPerHour: Math.max(snapshot.totalRequests * 60, snapshot.requestsPerSecond * 3600),
        backendRequestsPerHour: Math.max(snapshot.backendRequests * 60, snapshot.requestsPerSecond * 3600 * (1 - snapshot.cacheHitRate)),
        cacheHitsPerHour: Math.max(snapshot.cacheHits * 60, snapshot.requestsPerSecond * 3600 * snapshot.cacheHitRate),
        memoryUsedBytes: snapshot.memoryUsedBytes,
        egressBytesPerHour: snapshot.totalRequests * 60 * 8192,
      },
      settings
    );

    res.json({
      success: true,
      data: costBreakdown,
    });
  }
}

export const costController = new CostController();
