"use strict";
/**
 * Settings API Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsController = exports.SettingsController = void 0;
const repositories_1 = require("../repositories");
const redis_1 = require("../cache/redis");
const rateLimiter_1 = require("../protection/rateLimiter");
const circuitBreaker_1 = require("../protection/circuitBreaker");
class SettingsController {
    /**
     * GET /api/settings
     */
    async getSettings(req, res) {
        const settings = await repositories_1.settingsRepository.getSettings();
        res.json({
            success: true,
            data: settings,
        });
    }
    /**
     * PUT /api/settings
     */
    async updateSettings(req, res) {
        const updated = await repositories_1.settingsRepository.updateSettings(req.body);
        if (updated.cacheCapacityBytes) {
            redis_1.redisCache.setCapacity(updated.cacheCapacityBytes);
        }
        if (updated.rateLimitRps) {
            rateLimiter_1.rateLimiter.setLimit(updated.rateLimitRps);
        }
        if (updated.circuitBreakerFailureThreshold && updated.circuitBreakerRecoveryTimeMs) {
            circuitBreaker_1.circuitBreaker.setConfig(updated.circuitBreakerFailureThreshold, updated.circuitBreakerRecoveryTimeMs);
        }
        res.json({
            success: true,
            data: updated,
        });
    }
}
exports.SettingsController = SettingsController;
exports.settingsController = new SettingsController();
