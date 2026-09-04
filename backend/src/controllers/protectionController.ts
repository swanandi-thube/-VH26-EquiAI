/**
 * Backend Protection API Controller
 */

import { Request, Response } from 'express';
import { coalescer } from '../protection/coalescing';
import { circuitBreaker } from '../protection/circuitBreaker';
import { rateLimiter } from '../protection/rateLimiter';
import { requestQueue } from '../protection/requestQueue';
import { retryController } from '../protection/retryController';
import { dbClient } from '../database/client';
import { poolMonitor } from '../protection/connectionPool';

export class ProtectionController {
  public async getStats(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        coalescing: coalescer.getStats(),
        circuitBreaker: circuitBreaker.getStats(),
        rateLimiter: rateLimiter.getStats(),
        queue: requestQueue.getStats(),
        retry: retryController.getStats(),
        pool: dbClient.getMetrics(),
        replicas: poolMonitor.getReplicas(),
      },
    });
  }

  public async resetStats(req: Request, res: Response): Promise<void> {
    coalescer.resetCounters();
    circuitBreaker.reset();
    rateLimiter.reset();
    requestQueue.reset();
    retryController.reset();
    res.json({
      success: true,
      message: 'Backend protection metrics reset',
    });
  }
}

export const protectionController = new ProtectionController();
