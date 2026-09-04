/**
 * What-If Simulation API Controller
 */

import { Request, Response } from 'express';
import { whatIfEngine } from '../engine/whatif';
import { telemetry } from '../telemetry';
import { settingsRepository } from '../repositories';
import { redisCache } from '../cache/redis';
import { WhatIfScenarioInput } from '../types';

export class WhatIfController {
  public async runScenario(req: Request, res: Response): Promise<void> {
    const scenarioInput: WhatIfScenarioInput = req.body;
    const currentTelemetry = telemetry.getSnapshot();
    const settings = await settingsRepository.getSettings();

    const comparison = whatIfEngine.evaluate(scenarioInput, currentTelemetry, settings);
    res.json({
      success: true,
      data: comparison,
    });
  }

  public async applyScenario(req: Request, res: Response): Promise<void> {
    const scenarioInput: WhatIfScenarioInput = req.body;

    if (scenarioInput.cacheCapacityMb) {
      const bytes = scenarioInput.cacheCapacityMb * 1024 * 1024;
      redisCache.setCapacity(bytes);
      await settingsRepository.updateSettings({ cacheCapacityBytes: bytes });
    }

    res.json({
      success: true,
      message: `Scenario parameters applied: Cache capacity set to ${scenarioInput.cacheCapacityMb} MB`,
    });
  }
}

export const whatIfController = new WhatIfController();
