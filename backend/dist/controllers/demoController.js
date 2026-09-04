"use strict";
/**
 * Demo Controller for ADAPTIVECACHE
 * Provides REST endpoints for safe demo mode execution and isolation verification.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoController = exports.DemoController = void 0;
const demoService_1 = require("../services/demoService");
class DemoController {
    async start(req, res) {
        try {
            const { scenario, multiplier, cacheCapacityBytes, simulatedLatencyMs, simulatedErrorRate } = req.body;
            const scenarioId = scenario || 'BASIC_CACHE';
            const result = await demoService_1.demoService.start(scenarioId, {
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
        }
        catch (err) {
            res.status(500).json({
                success: false,
                message: `Failed to execute demo scenario: ${err.message}`,
            });
        }
    }
    stop(req, res) {
        const result = demoService_1.demoService.stop();
        res.json({
            success: true,
            message: result.message,
        });
    }
    async reset(req, res) {
        try {
            const result = await demoService_1.demoService.reset();
            res.json({
                success: true,
                message: 'Demo mode reset successfully. Only demo keys and records were removed.',
                data: result,
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                message: `Failed to reset demo mode: ${err.message}`,
            });
        }
    }
    getStatus(req, res) {
        const status = demoService_1.demoService.getStatus();
        res.json({
            success: true,
            data: status,
        });
    }
    getScenarios(req, res) {
        const scenarios = demoService_1.demoService.getScenarios();
        res.json({
            success: true,
            data: scenarios,
        });
    }
}
exports.DemoController = DemoController;
exports.demoController = new DemoController();
