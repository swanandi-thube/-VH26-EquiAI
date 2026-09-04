"use strict";
/**
 * Real Request Pipeline for ADAPTIVECACHE
 * Ingress -> Rate Limiter -> Redis -> Singleflight Coalescer -> Circuit Breaker -> Database -> Scorer & Dynamic TTL -> Cache SET -> Telemetry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipeline = exports.RequestPipeline = void 0;
const uuid_1 = require("uuid");
const redis_1 = require("../cache/redis");
const rateLimiter_1 = require("../protection/rateLimiter");
const circuitBreaker_1 = require("../protection/circuitBreaker");
const coalescing_1 = require("../protection/coalescing");
const connectionPool_1 = require("../protection/connectionPool");
const client_1 = require("../database/client");
const scorer_1 = require("../engine/scorer");
const lifecycle_1 = require("../engine/lifecycle");
const predictor_1 = require("../engine/predictor");
const repositories_1 = require("../repositories");
class RequestPipeline {
    /**
     * Main pipeline request processor supporting generic objectId
     */
    async processRequest(objectId, simulatedLatencyMs, simulatedErrorRate) {
        const startTime = Date.now();
        const requestId = `REQ-${(0, uuid_1.v4)().substring(0, 8)}`;
        const cacheKey = `cache:obj:${objectId}`;
        // 1. Rate Limiter Token Bucket Check
        if (!rateLimiter_1.rateLimiter.tryAcquire(1)) {
            const totalLatency = Date.now() - startTime;
            const log = {
                requestId,
                timestamp: startTime,
                objectId,
                operation: 'GET',
                responseSizeBytes: 0,
                cacheHit: false,
                backendLatencyMs: 0,
                totalLatencyMs: totalLatency,
                statusCode: 429,
                errorMessage: 'Rate limit exceeded (Token Bucket Throttling)',
            };
            await repositories_1.requestLogRepository.log(log);
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: startTime,
                eventType: 'RATE-LIMIT',
                objectId,
                reason: 'Incoming request rate exceeded configured RPS threshold',
            });
            return {
                requestId,
                objectId,
                statusCode: 429,
                data: null,
                cacheHit: false,
                wasCoalesced: false,
                backendLatencyMs: 0,
                totalLatencyMs: totalLatency,
                errorMessage: 'Too Many Requests (Rate Limited)',
            };
        }
        // 2. Record Access in Demand Velocity Predictor
        predictor_1.predictor.recordAccess(objectId, startTime);
        // 3. Redis Cache Lookup (Live Cache)
        const cacheResult = await redis_1.redisCache.get(cacheKey);
        if (cacheResult.hit && cacheResult.value) {
            // --- CACHE HIT ---
            let parsedData = null;
            try {
                parsedData = JSON.parse(cacheResult.value);
            }
            catch {
                parsedData = cacheResult.value;
            }
            const totalLatency = Math.max(1, Date.now() - startTime);
            // Re-evaluate lifecycle for active item (e.g. background REFRESH if TTL is expiring)
            const currentMeta = cacheResult.metadata;
            const settings = await repositories_1.settingsRepository.getSettings();
            const pool = client_1.dbClient.getMetrics();
            const factors = scorer_1.scorer.calculateFactors(currentMeta, settings, {
                poolUtilization: pool.utilization,
                queueDepth: pool.connectionQueueDepth,
                errorRate: circuitBreaker_1.circuitBreaker.getStats().errorRate,
                avgBackendLatencyMs: 50,
            });
            const evalResult = lifecycle_1.lifecycle.evaluate(currentMeta, factors, settings, true);
            redis_1.redisCache.updateMetadata(cacheKey, {
                adaptiveScore: factors.finalScore,
                predictedDemand: factors.predictedDemand,
                confidence: factors.confidence,
                lastDecision: evalResult.decision,
                lastDecisionTime: Date.now(),
            });
            // If decision is REFRESH, trigger async background refresh before expiration
            if (evalResult.decision === 'REFRESH') {
                redis_1.redisCache.incrementRefresh();
                this.triggerBackgroundRefresh(objectId, cacheKey);
            }
            const log = {
                requestId,
                timestamp: startTime,
                objectId,
                operation: 'GET',
                responseSizeBytes: currentMeta.sizeBytes,
                cacheHit: true,
                backendLatencyMs: 0,
                totalLatencyMs: totalLatency,
                statusCode: 200,
                wasCoalesced: false,
            };
            await repositories_1.requestLogRepository.log(log);
            return {
                requestId,
                objectId,
                statusCode: 200,
                data: parsedData,
                cacheHit: true,
                wasCoalesced: false,
                backendLatencyMs: 0,
                totalLatencyMs: totalLatency,
                decision: evalResult.decision,
                adaptiveScore: factors.finalScore,
            };
        }
        // --- CACHE MISS ---
        // 4. Circuit Breaker Check
        if (!circuitBreaker_1.circuitBreaker.canExecute()) {
            const totalLatency = Date.now() - startTime;
            const log = {
                requestId,
                timestamp: startTime,
                objectId,
                operation: 'GET',
                responseSizeBytes: 0,
                cacheHit: false,
                backendLatencyMs: 0,
                totalLatencyMs: totalLatency,
                statusCode: 503,
                errorMessage: 'Circuit Breaker is OPEN. Backend protection active.',
            };
            await repositories_1.requestLogRepository.log(log);
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: startTime,
                eventType: 'CIRCUIT-BREAKER',
                objectId,
                reason: 'Request short-circuited: Circuit Breaker in OPEN state due to high backend failure rate',
            });
            return {
                requestId,
                objectId,
                statusCode: 503,
                data: null,
                cacheHit: false,
                wasCoalesced: false,
                backendLatencyMs: 0,
                totalLatencyMs: totalLatency,
                errorMessage: 'Service Unavailable (Circuit Breaker OPEN)',
            };
        }
        // 5. Request Coalescing (Singleflight) for concurrent misses
        const { result: backendResponse, wasCoalesced } = await coalescing_1.coalescer.execute(cacheKey, async () => {
            const fetchStart = Date.now();
            // Simulated error rate check
            const errRate = simulatedErrorRate !== undefined ? simulatedErrorRate : 0;
            if (errRate > 0 && ((Date.now() + objectId.length) % 100) < (errRate * 100)) {
                const delay = simulatedLatencyMs || 250;
                await new Promise(r => setTimeout(r, delay));
                return {
                    entity: null,
                    latencyMs: Date.now() - fetchStart,
                    statusCode: 503,
                };
            }
            const entity = await repositories_1.cacheObjectRepository.findById(objectId);
            // Determine realistic query delay
            let delayMs = 0;
            if (simulatedLatencyMs !== undefined && simulatedLatencyMs > 0) {
                delayMs = simulatedLatencyMs;
            }
            else if (entity) {
                delayMs = entity.baseRetrievalCostMs;
            }
            else {
                delayMs = 25; // lookup time for missing item
            }
            await new Promise(r => setTimeout(r, delayMs));
            return {
                entity,
                latencyMs: Date.now() - fetchStart,
                statusCode: entity ? 200 : 404,
            };
        });
        const isSuccess = backendResponse.statusCode === 200 && backendResponse.entity !== null;
        circuitBreaker_1.circuitBreaker.recordResult(isSuccess);
        const totalLatency = Date.now() - startTime;
        if (!isSuccess || !backendResponse.entity) {
            const log = {
                requestId,
                timestamp: startTime,
                objectId,
                operation: 'GET',
                responseSizeBytes: 0,
                cacheHit: false,
                backendLatencyMs: backendResponse.latencyMs,
                totalLatencyMs: totalLatency,
                statusCode: backendResponse.statusCode,
                errorMessage: backendResponse.statusCode === 404 ? 'Object not found' : 'Backend execution error',
                wasCoalesced,
            };
            await repositories_1.requestLogRepository.log(log);
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: startTime,
                eventType: 'BACKEND-ERROR',
                objectId,
                reason: `Backend query failed with status code ${backendResponse.statusCode}`,
            });
            return {
                requestId,
                objectId,
                statusCode: backendResponse.statusCode,
                data: null,
                cacheHit: false,
                wasCoalesced,
                backendLatencyMs: backendResponse.latencyMs,
                totalLatencyMs: totalLatency,
                errorMessage: 'Backend lookup failed',
            };
        }
        // 6. Decision Engine & Multi-factor Scoring for new object
        const entity = backendResponse.entity;
        const settings = await repositories_1.settingsRepository.getSettings();
        const pool = client_1.dbClient.getMetrics();
        connectionPool_1.poolMonitor.updateReplicaLoad(pool.activeConnections, 1.0);
        const candidateMeta = {
            objectId,
            key: cacheKey,
            sizeBytes: entity.sizeBytes,
            retrievalCostMs: entity.baseRetrievalCostMs,
            backendLatencyMs: backendResponse.latencyMs,
            accessCount: 1,
            lastAccessed: Date.now(),
        };
        const factors = scorer_1.scorer.calculateFactors(candidateMeta, settings, {
            poolUtilization: pool.utilization,
            queueDepth: pool.connectionQueueDepth,
            errorRate: circuitBreaker_1.circuitBreaker.getStats().errorRate,
            avgBackendLatencyMs: backendResponse.latencyMs,
        });
        const evalResult = lifecycle_1.lifecycle.evaluate(candidateMeta, factors, settings, false);
        await repositories_1.decisionRepository.log(evalResult.decisionRecord);
        // 7. Store in Redis Live Cache with dynamic TTL & metadata
        await redis_1.redisCache.set(cacheKey, JSON.stringify(entity.payload || entity), {
            objectId,
            sizeBytes: entity.sizeBytes,
            retrievalCostMs: entity.baseRetrievalCostMs,
            backendLatencyMs: backendResponse.latencyMs,
            ttlSeconds: evalResult.newTtlSeconds,
            predictedDemand: factors.predictedDemand,
            confidence: factors.confidence,
            adaptiveScore: factors.finalScore,
            lastDecision: evalResult.decision,
            isPreCached: evalResult.decision === 'PRE-CACHE',
        }, evalResult.newTtlSeconds);
        if (evalResult.decision === 'PRE-CACHE') {
            redis_1.redisCache.incrementPreCache();
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: Date.now(),
                eventType: 'PRE-CACHE',
                objectId,
                score: factors.finalScore,
                reason: evalResult.reason,
            });
        }
        const log = {
            requestId,
            timestamp: startTime,
            objectId,
            operation: 'GET',
            responseSizeBytes: entity.sizeBytes,
            cacheHit: false,
            backendLatencyMs: backendResponse.latencyMs,
            totalLatencyMs: totalLatency,
            statusCode: 200,
            wasCoalesced,
        };
        await repositories_1.requestLogRepository.log(log);
        return {
            requestId,
            objectId,
            statusCode: 200,
            data: entity.payload || entity,
            cacheHit: false,
            wasCoalesced,
            backendLatencyMs: backendResponse.latencyMs,
            totalLatencyMs: totalLatency,
            decision: evalResult.decision,
            adaptiveScore: factors.finalScore,
        };
    }
    /**
     * Compatibility alias for processRequest
     */
    async processProductRequest(objectId, simulatedLatencyMs, simulatedErrorRate) {
        return this.processRequest(objectId, simulatedLatencyMs, simulatedErrorRate);
    }
    /**
     * Asynchronous background refresh for high-value items approaching expiration
     */
    async triggerBackgroundRefresh(objectId, cacheKey) {
        try {
            const entity = await repositories_1.cacheObjectRepository.findById(objectId);
            if (entity) {
                const settings = await repositories_1.settingsRepository.getSettings();
                const pool = client_1.dbClient.getMetrics();
                const factors = scorer_1.scorer.calculateFactors({
                    objectId,
                    sizeBytes: entity.sizeBytes,
                    retrievalCostMs: entity.baseRetrievalCostMs,
                    backendLatencyMs: 50,
                    accessCount: 10,
                }, settings, {
                    poolUtilization: pool.utilization,
                    queueDepth: pool.connectionQueueDepth,
                    errorRate: 0,
                    avgBackendLatencyMs: 50,
                });
                const evalRes = lifecycle_1.lifecycle.evaluate({ objectId }, factors, settings, true);
                await redis_1.redisCache.set(cacheKey, JSON.stringify(entity.payload || entity), {
                    objectId,
                    sizeBytes: entity.sizeBytes,
                    retrievalCostMs: entity.baseRetrievalCostMs,
                    backendLatencyMs: 50,
                    ttlSeconds: evalRes.newTtlSeconds,
                    predictedDemand: factors.predictedDemand,
                    confidence: factors.confidence,
                    adaptiveScore: factors.finalScore,
                    lastDecision: 'REFRESH',
                }, evalRes.newTtlSeconds);
                await repositories_1.eventRepository.log({
                    id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                    timestamp: Date.now(),
                    eventType: 'REFRESH',
                    objectId,
                    score: factors.finalScore,
                    reason: `Background refresh succeeded. TTL extended by ${evalRes.newTtlSeconds}s`,
                });
            }
        }
        catch (err) {
            console.warn(`[Pipeline] Background refresh error for ${objectId}:`, err.message);
        }
    }
}
exports.RequestPipeline = RequestPipeline;
exports.pipeline = new RequestPipeline();
