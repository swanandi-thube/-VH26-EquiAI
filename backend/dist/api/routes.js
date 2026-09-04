"use strict";
/**
 * REST API Routes for ADAPTIVECACHE Platform
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const controllers_1 = require("../controllers");
const telemetry_1 = require("../telemetry");
const repositories_1 = require("../repositories");
exports.apiRouter = (0, express_1.Router)();
// --- Health Verification ---
exports.apiRouter.get('/health', (req, res) => controllers_1.healthController.getHealth(req, res));
exports.apiRouter.get('/system/health', (req, res) => controllers_1.healthController.getHealth(req, res));
// --- Dashboard & Telemetry ---
exports.apiRouter.get('/dashboard/metrics', (req, res) => {
    const snapshot = telemetry_1.telemetry.getSnapshot();
    res.json({
        success: true,
        data: snapshot,
    });
});
exports.apiRouter.get('/telemetry', async (req, res) => {
    const snapshot = telemetry_1.telemetry.getSnapshot();
    const recentLogs = await repositories_1.requestLogRepository.getRecent(100);
    res.json({
        success: true,
        data: {
            snapshot,
            recentLogs,
        },
    });
});
// --- Cache Objects & Inspection ---
exports.apiRouter.get('/cache/objects', (req, res) => controllers_1.cacheController.getCacheObjects(req, res));
exports.apiRouter.post('/cache/flush', (req, res) => controllers_1.cacheController.flushCache(req, res));
exports.apiRouter.post('/cache/request/:id', (req, res) => controllers_1.cacheController.executeRequest(req, res));
// --- Decisions & Explainability ---
exports.apiRouter.get('/cache/decisions', (req, res) => controllers_1.cacheController.getDecisions(req, res));
exports.apiRouter.get('/cache/decisions/:id/explain', (req, res) => controllers_1.cacheController.getDecisionExplanation(req, res));
// --- Activity Stream & Audit Events ---
exports.apiRouter.get('/cache/events', (req, res) => controllers_1.cacheController.getEvents(req, res));
// --- Traffic Lab & Workloads ---
exports.apiRouter.post('/workloads/start', (req, res) => controllers_1.workloadController.startWorkload(req, res));
exports.apiRouter.post('/workloads/stop', (req, res) => controllers_1.workloadController.stopWorkload(req, res));
exports.apiRouter.get('/workloads/active', (req, res) => controllers_1.workloadController.getActiveWorkload(req, res));
// --- Backend Protection & Concurrency Defense ---
exports.apiRouter.get('/protection/stats', (req, res) => controllers_1.protectionController.getStats(req, res));
exports.apiRouter.post('/protection/reset', (req, res) => controllers_1.protectionController.resetStats(req, res));
// --- Benchmark Engine ---
exports.apiRouter.post('/benchmark/run', (req, res) => controllers_1.benchmarkController.runBenchmark(req, res));
exports.apiRouter.get('/benchmark/runs', (req, res) => controllers_1.benchmarkController.getBenchmarkRuns(req, res));
exports.apiRouter.get('/benchmark/:id', (req, res) => controllers_1.benchmarkController.getBenchmarkRunById(req, res));
// --- What-If Scenario Counterfactual Analysis ---
exports.apiRouter.post('/scenarios/run', (req, res) => controllers_1.whatIfController.runScenario(req, res));
exports.apiRouter.post('/scenarios/apply', (req, res) => controllers_1.whatIfController.applyScenario(req, res));
// --- Cost & ROI Infrastructure Model ---
exports.apiRouter.get('/cost', (req, res) => controllers_1.costController.getCost(req, res));
// --- System Configuration & Policies ---
exports.apiRouter.get('/settings', (req, res) => controllers_1.settingsController.getSettings(req, res));
exports.apiRouter.put('/settings', (req, res) => controllers_1.settingsController.updateSettings(req, res));
