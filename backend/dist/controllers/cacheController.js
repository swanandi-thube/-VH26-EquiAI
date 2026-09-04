"use strict";
/**
 * Cache & Decision API Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheController = exports.CacheController = void 0;
const redis_1 = require("../cache/redis");
const pipeline_1 = require("../pipeline");
const repositories_1 = require("../repositories");
const explainability_1 = require("../engine/explainability");
class CacheController {
    /**
     * GET /api/cache/objects
     */
    async getCacheObjects(req, res) {
        const objects = redis_1.redisCache.getAllObjects();
        const stats = redis_1.redisCache.getStats();
        res.json({
            success: true,
            data: {
                objects,
                stats,
            },
        });
    }
    /**
     * POST /api/cache/flush
     */
    async flushCache(req, res) {
        await redis_1.redisCache.flushall();
        redis_1.redisCache.resetCounters();
        res.json({
            success: true,
            message: 'Cache flushed and counters reset successfully',
        });
    }
    /**
     * POST /api/cache/request/:id
     */
    async executeRequest(req, res) {
        const objectId = req.params.id;
        const latency = req.query.latency ? parseInt(req.query.latency, 10) : undefined;
        const errorRate = req.query.errorRate ? parseFloat(req.query.errorRate) : undefined;
        const result = await pipeline_1.pipeline.processRequest(objectId, latency, errorRate);
        res.json({
            success: result.statusCode === 200,
            data: result,
        });
    }
    /**
     * GET /api/cache/decisions
     */
    async getDecisions(req, res) {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const decisions = await repositories_1.decisionRepository.getRecent(limit);
        res.json({
            success: true,
            data: decisions,
        });
    }
    /**
     * GET /api/cache/decisions/:id/explain
     */
    async getDecisionExplanation(req, res) {
        const decisionId = req.params.id;
        const record = await repositories_1.decisionRepository.findById(decisionId);
        if (!record) {
            res.status(404).json({ success: false, message: `Decision with ID ${decisionId} not found` });
            return;
        }
        const settings = await repositories_1.settingsRepository.getSettings();
        const explanation = explainability_1.explainability.explain(record, settings);
        res.json({
            success: true,
            data: explanation,
        });
    }
    /**
     * GET /api/cache/events
     */
    async getEvents(req, res) {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const filter = req.query.filter;
        const events = await repositories_1.eventRepository.getRecent(limit, filter);
        res.json({
            success: true,
            data: events,
        });
    }
}
exports.CacheController = CacheController;
exports.cacheController = new CacheController();
