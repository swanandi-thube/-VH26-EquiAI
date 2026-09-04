/**
 * Settings API Controller
 */

import { Request, Response } from 'express';
import { settingsRepository } from '../repositories';
import { redisCache } from '../cache/redis';
import { rateLimiter } from '../protection/rateLimiter';
import { circuitBreaker } from '../protection/circuitBreaker';

export class SettingsController {
  /**
   * GET /api/settings
   */
  public async getSettings(req: Request, res: Response): Promise<void> {
    const settings = await settingsRepository.getSettings();
    res.json({
      success: true,
      data: settings,
    });
  }

  /**
   * PUT /api/settings
   */
  public async updateSettings(req: Request, res: Response): Promise<void> {
    const updated = await settingsRepository.updateSettings(req.body);

    if (updated.cacheCapacityBytes) {
      redisCache.setCapacity(updated.cacheCapacityBytes);
    }
    if (updated.rateLimitRps) {
      rateLimiter.setLimit(updated.rateLimitRps);
    }
    if (updated.circuitBreakerFailureThreshold && updated.circuitBreakerRecoveryTimeMs) {
      circuitBreaker.setConfig(updated.circuitBreakerFailureThreshold, updated.circuitBreakerRecoveryTimeMs);
    }

    res.json({
      success: true,
      data: updated,
    });
  }
}

export const settingsController = new SettingsController();
