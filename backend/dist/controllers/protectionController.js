"use strict";
/**
 * Backend Protection API Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.protectionController = exports.ProtectionController = void 0;
const coalescing_1 = require("../protection/coalescing");
const circuitBreaker_1 = require("../protection/circuitBreaker");
const rateLimiter_1 = require("../protection/rateLimiter");
const requestQueue_1 = require("../protection/requestQueue");
const retryController_1 = require("../protection/retryController");
const client_1 = require("../database/client");
const connectionPool_1 = require("../protection/connectionPool");
class ProtectionController {
    async getStats(req, res) {
        res.json({
            success: true,
            data: {
                coalescing: coalescing_1.coalescer.getStats(),
                circuitBreaker: circuitBreaker_1.circuitBreaker.getStats(),
                rateLimiter: rateLimiter_1.rateLimiter.getStats(),
                queue: requestQueue_1.requestQueue.getStats(),
                retry: retryController_1.retryController.getStats(),
                pool: client_1.dbClient.getMetrics(),
                replicas: connectionPool_1.poolMonitor.getReplicas(),
            },
        });
    }
    async resetStats(req, res) {
        coalescing_1.coalescer.resetCounters();
        circuitBreaker_1.circuitBreaker.reset();
        rateLimiter_1.rateLimiter.reset();
        requestQueue_1.requestQueue.reset();
        retryController_1.retryController.reset();
        res.json({
            success: true,
            message: 'Backend protection metrics reset',
        });
    }
}
exports.ProtectionController = ProtectionController;
exports.protectionController = new ProtectionController();
