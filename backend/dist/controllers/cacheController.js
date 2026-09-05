"use strict";
/**
 * Cache, Product & Decision API Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheController = exports.CacheController = void 0;
const redis_1 = require("../cache/redis");
const pipeline_1 = require("../pipeline");
const repositories_1 = require("../repositories");
const explainability_1 = require("../engine/explainability");
class CacheController {
    /**
     * GET /api/products
     * List all realistic commodity products from database
     */
    async getProducts(req, res) {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
        const products = await repositories_1.cacheObjectRepository.findAll(limit, offset);
        const total = await repositories_1.cacheObjectRepository.count();
        res.json({
            success: true,
            data: {
                total,
                products,
            },
        });
    }
    /**
     * GET /api/products/:objectId
     * Get single product from PostgreSQL/store
     */
    async getProductById(req, res) {
        const objectId = req.params.objectId || req.params.id;
        const product = await repositories_1.cacheObjectRepository.findById(objectId);
        if (!product) {
            res.status(404).json({
                success: false,
                message: `Product with objectId "${objectId}" not found`,
            });
            return;
        }
        res.json({
            success: true,
            data: product,
        });
    }
    /**
     * GET /api/cache/objects
     */
    async getCacheObjects(req, res) {
        const mode = req.query.mode;
        const filterPrefix = mode === 'demo' ? 'adaptivecache:demo:' : (mode === 'live' ? 'cache:obj:' : undefined);
        const objects = redis_1.redisCache.getAllObjects(filterPrefix);
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
     * POST /api/cache/invalidate/:objectId
     */
    async invalidateObject(req, res) {
        const objectId = req.params.objectId || req.params.id;
        const cacheKey = `cache:obj:${objectId}`;
        const demoCacheKey = `adaptivecache:demo:obj:${objectId}`;
        await redis_1.redisCache.del(cacheKey);
        await redis_1.redisCache.del(demoCacheKey);
        await repositories_1.eventRepository.log({
            id: `EVT-INV-${Date.now()}`,
            timestamp: Date.now(),
            eventType: 'EVICT',
            objectId,
            reason: `Cache manual invalidation triggered for ${objectId}`,
            source: 'live',
            mode: 'live',
        });
        res.json({
            success: true,
            message: `Cache object "${objectId}" invalidated successfully`,
        });
    }
    /**
     * GET /api/cache/:objectId and POST /api/cache/request/:id
     * Executes the exact operational request lifecycle
     */
    async executeRequest(req, res) {
        const objectId = req.params.objectId || req.params.id;
        const latency = req.query.latency ? parseInt(req.query.latency, 10) : undefined;
        const errorRate = req.query.errorRate ? parseFloat(req.query.errorRate) : undefined;
        const mode = req.query.mode;
        const result = await pipeline_1.pipeline.processRequest(objectId, latency, errorRate, mode);
        res.status(result.statusCode === 200 ? 200 : result.statusCode).json({
            success: result.statusCode === 200,
            data: result,
        });
    }
    /**
     * GET /api/cache/decisions
     */
    async getDecisions(req, res) {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const mode = req.query.mode;
        let decisions = await repositories_1.decisionRepository.getRecent(limit);
        if (mode === 'demo') {
            decisions = decisions.filter(d => d.source === 'demo' || d.reason.startsWith('[DEMO]') || d.objectId.startsWith('DEMO-'));
        }
        else if (mode === 'live') {
            decisions = decisions.filter(d => d.source !== 'demo' && !d.reason.startsWith('[DEMO]') && !d.objectId.startsWith('DEMO-'));
        }
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
     * GET /api/cache/events & GET /api/activity
     */
    async getEvents(req, res) {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const filter = req.query.filter;
        const mode = req.query.mode;
        const events = await repositories_1.eventRepository.getRecent(limit, filter, mode);
        res.json({
            success: true,
            data: events,
        });
    }
    /**
     * GET /api/history
     * Returns persistent historical logs & live vs historical breakdown
     */
    async getHistory(req, res) {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const recentLogs = await repositories_1.requestLogRepository.getRecent(limit);
        const breakdown = await repositories_1.requestLogRepository.getMetricsBreakdown();
        res.json({
            success: true,
            data: {
                recentLogs,
                breakdown,
            },
        });
    }
}
exports.CacheController = CacheController;
exports.cacheController = new CacheController();
