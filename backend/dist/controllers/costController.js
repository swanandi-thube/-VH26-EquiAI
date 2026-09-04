"use strict";
/**
 * Cost & ROI Model API Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.costController = exports.CostController = void 0;
const cost_1 = require("../engine/cost");
const telemetry_1 = require("../telemetry");
const repositories_1 = require("../repositories");
class CostController {
    async getCost(req, res) {
        const snapshot = telemetry_1.telemetry.getSnapshot();
        const settings = await repositories_1.settingsRepository.getSettings();
        const costBreakdown = cost_1.costEngine.calculateCost({
            totalRequestsPerHour: Math.max(snapshot.totalRequests * 60, snapshot.requestsPerSecond * 3600),
            backendRequestsPerHour: Math.max(snapshot.backendRequests * 60, snapshot.requestsPerSecond * 3600 * (1 - snapshot.cacheHitRate)),
            cacheHitsPerHour: Math.max(snapshot.cacheHits * 60, snapshot.requestsPerSecond * 3600 * snapshot.cacheHitRate),
            memoryUsedBytes: snapshot.memoryUsedBytes,
            egressBytesPerHour: snapshot.totalRequests * 60 * 8192,
        }, settings);
        res.json({
            success: true,
            data: costBreakdown,
        });
    }
}
exports.CostController = CostController;
exports.costController = new CostController();
