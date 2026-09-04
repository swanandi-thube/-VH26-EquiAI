"use strict";
/**
 * Real Request Pipeline for ADAPTIVECACHE
 * Delegates to CacheService and exposes unified pipeline interface for workloads and controllers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipeline = exports.RequestPipeline = void 0;
const cacheService_1 = require("../services/cacheService");
class RequestPipeline {
    /**
     * Process generic object request through the real cache request flow
     */
    async processRequest(objectId, simulatedLatencyMs, simulatedErrorRate, mode) {
        const res = await cacheService_1.cacheService.handleRequest(objectId, {
            simulatedLatencyMs,
            simulatedErrorRate,
            mode,
        });
        return {
            requestId: res.requestId,
            objectId: res.objectId,
            statusCode: res.statusCode,
            data: res.data,
            cacheHit: res.cacheHit,
            backendCalled: res.backendCalled,
            wasCoalesced: res.wasCoalesced || false,
            cacheLatencyMs: res.cacheLatencyMs,
            backendLatencyMs: res.backendLatencyMs,
            totalLatencyMs: res.totalLatencyMs,
            decision: res.metadata?.lastDecision || (res.cacheHit ? 'KEEP' : 'MISS'),
            adaptiveScore: res.metadata?.adaptiveScore,
            errorMessage: res.errorMessage,
        };
    }
    /**
     * Backward-compatible alias
     */
    async processProductRequest(objectId, simulatedLatencyMs, simulatedErrorRate, mode) {
        return this.processRequest(objectId, simulatedLatencyMs, simulatedErrorRate, mode);
    }
}
exports.RequestPipeline = RequestPipeline;
exports.pipeline = new RequestPipeline();
