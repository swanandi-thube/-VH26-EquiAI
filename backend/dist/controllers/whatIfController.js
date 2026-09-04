"use strict";
/**
 * What-If Simulation API Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatIfController = exports.WhatIfController = void 0;
const whatif_1 = require("../engine/whatif");
const telemetry_1 = require("../telemetry");
const repositories_1 = require("../repositories");
const redis_1 = require("../cache/redis");
class WhatIfController {
    async runScenario(req, res) {
        const scenarioInput = req.body;
        const currentTelemetry = telemetry_1.telemetry.getSnapshot();
        const settings = await repositories_1.settingsRepository.getSettings();
        const comparison = whatif_1.whatIfEngine.evaluate(scenarioInput, currentTelemetry, settings);
        res.json({
            success: true,
            data: comparison,
        });
    }
    async applyScenario(req, res) {
        const scenarioInput = req.body;
        if (scenarioInput.cacheCapacityMb) {
            const bytes = scenarioInput.cacheCapacityMb * 1024 * 1024;
            redis_1.redisCache.setCapacity(bytes);
            await repositories_1.settingsRepository.updateSettings({ cacheCapacityBytes: bytes });
        }
        res.json({
            success: true,
            message: `Scenario parameters applied: Cache capacity set to ${scenarioInput.cacheCapacityMb} MB`,
        });
    }
}
exports.WhatIfController = WhatIfController;
exports.whatIfController = new WhatIfController();
