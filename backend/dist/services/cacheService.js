"use strict";
/**
 * Real Cache Engine & Request Flow Service for ADAPTIVECACHE
 *
 * Execution Flow:
 * Application/frontend -> Backend API -> Cache Service -> Redis GET
 *   HIT  -> Return cached data, calculate cache latency, update access metadata, do NOT call origin.
 *   MISS -> Fetch from origin source, measure backend latency, Redis SET, record metadata & logs, return data.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = exports.CacheService = void 0;
const uuid_1 = require("uuid");
const redis_1 = require("../cache/redis");
const originAdapter_1 = require("./originAdapter");
const repositories_1 = require("../repositories");
const predictor_1 = require("../engine/predictor");
const scorer_1 = require("../engine/scorer");
const lifecycle_1 = require("../engine/lifecycle");
const client_1 = require("../database/client");
const circuitBreaker_1 = require("../protection/circuitBreaker");
const coalescing_1 = require("../protection/coalescing");
const rateLimiter_1 = require("../protection/rateLimiter");
const requestQueue_1 = require("../protection/requestQueue");
const retryController_1 = require("../protection/retryController");
class CacheService {
    originAdapter;
    constructor(originAdapter = originAdapter_1.defaultOriginAdapter) {
        this.originAdapter = originAdapter;
    }
    /**
     * Set custom origin adapter (e.g. for testing)
     */
    setOriginAdapter(adapter) {
        this.originAdapter = adapter;
    }
    /**
     * Core cache request execution flow (supports both LIVE and DEMO mode)
     */
    async handleRequest(objectId, options) {
        const isDemo = options?.mode === 'demo' || objectId.startsWith('DEMO-');
        const startTotalTime = Date.now();
        const requestId = `${isDemo ? 'DEMO-REQ' : 'REQ'}-${(0, uuid_1.v4)().substring(0, 8)}`;
        const cacheKey = isDemo ? `adaptivecache:demo:obj:${objectId}` : `cache:obj:${objectId}`;
        const source = isDemo ? 'demo' : 'live';
        const effectiveOriginAdapter = isDemo ? originAdapter_1.demoOriginAdapter : this.originAdapter;
        // 1. Rate Limiting Check (Token Bucket)
        if (!options?.bypassRateLimiter && !rateLimiter_1.rateLimiter.tryAcquire(1)) {
            const totalLatency = Date.now() - startTotalTime;
            const log = {
                requestId,
                timestamp: startTotalTime,
                objectId,
                operation: 'GET',
                responseSizeBytes: 0,
                cacheHit: false,
                backendCalled: false,
                backendLatencyMs: 0,
                cacheLatencyMs: 0,
                totalLatencyMs: totalLatency,
                statusCode: 429,
                errorMessage: `${isDemo ? '[DEMO] ' : ''}Rate limit exceeded (Token Bucket Throttled)`,
                source,
                mode: isDemo ? 'demo' : 'live',
            };
            await repositories_1.requestLogRepository.log(log);
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: startTotalTime,
                eventType: 'RATE-LIMIT',
                objectId,
                reason: `${isDemo ? '[DEMO] ' : ''}Rate limit exceeded: incoming rate above configured RPS`,
                source,
                mode: isDemo ? 'demo' : 'live',
            });
            return {
                requestId,
                objectId,
                cacheHit: false,
                backendCalled: false,
                cacheLatencyMs: 0,
                backendLatencyMs: 0,
                totalLatencyMs: totalLatency,
                statusCode: 429,
                data: null,
                responseSizeBytes: 0,
                errorMessage: 'Too Many Requests (Rate Limited)',
            };
        }
        // 2. Record access timestamp for statistical demand prediction
        predictor_1.predictor.recordAccess(objectId, startTotalTime);
        // 3. Redis GET with cache latency measurement
        const cacheGetStart = Date.now();
        const cacheResult = await redis_1.redisCache.get(cacheKey);
        const cacheLatencyMs = Math.max(1, Date.now() - cacheGetStart);
        // =========================================================================
        // CACHE HIT PATH
        // =========================================================================
        if (cacheResult.hit && cacheResult.value !== null) {
            let parsedData;
            try {
                parsedData = JSON.parse(cacheResult.value);
            }
            catch {
                parsedData = cacheResult.value;
            }
            const totalLatencyMs = Math.max(1, Date.now() - startTotalTime);
            const meta = cacheResult.metadata;
            // Update access metadata (frequency and last_access)
            const now = Date.now();
            meta.lastAccessed = now;
            meta.accessCount = (meta.accessCount || 0) + 1;
            meta.frequency = meta.accessCount;
            meta.updatedAt = now;
            // Lifecycle evaluation on hit (e.g. background refresh if TTL is almost exhausted)
            const settings = await repositories_1.settingsRepository.getSettings();
            const pool = client_1.dbClient.getMetrics();
            const factors = scorer_1.scorer.calculateFactors(meta, settings, {
                poolUtilization: pool.utilization,
                queueDepth: pool.connectionQueueDepth,
                errorRate: circuitBreaker_1.circuitBreaker.getStats().errorRate,
                avgBackendLatencyMs: 50,
            });
            const evalResult = lifecycle_1.lifecycle.evaluate(meta, factors, settings, true);
            meta.adaptiveScore = factors.finalScore;
            meta.currentState = evalResult.decision;
            meta.lastDecision = evalResult.decision;
            meta.lastDecisionTime = now;
            // Update metadata in Redis
            redis_1.redisCache.updateMetadata(cacheKey, meta);
            // If decision is REFRESH, trigger asynchronous background refresh
            if (evalResult.decision === 'REFRESH') {
                redis_1.redisCache.incrementRefresh();
                this.triggerBackgroundRefresh(objectId, cacheKey);
            }
            // Record Request Log and Event for HIT
            const log = {
                requestId,
                timestamp: startTotalTime,
                objectId,
                operation: 'GET',
                responseSizeBytes: meta.sizeBytes,
                cacheHit: true,
                backendCalled: false,
                backendLatencyMs: 0,
                cacheLatencyMs,
                totalLatencyMs,
                statusCode: 200,
                wasCoalesced: false,
                source,
                mode: isDemo ? 'demo' : 'live',
            };
            await repositories_1.requestLogRepository.log(log);
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: now,
                eventType: 'CACHE-HIT',
                objectId,
                score: meta.adaptiveScore,
                reason: `${isDemo ? '[DEMO] ' : ''}CACHE HIT: Served from Redis in ${cacheLatencyMs}ms (Remaining TTL: ${meta.remainingTtlSeconds}s)`,
                source,
                mode: isDemo ? 'demo' : 'live',
            });
            return {
                requestId,
                objectId,
                cacheHit: true,
                backendCalled: false,
                cacheLatencyMs,
                backendLatencyMs: 0,
                totalLatencyMs,
                statusCode: 200,
                data: parsedData,
                responseSizeBytes: meta.sizeBytes,
                metadata: meta,
            };
        }
        // =========================================================================
        // CACHE MISS PATH
        // =========================================================================
        // 4. Check Circuit Breaker & Cache-First Protection before calling origin
        if (!circuitBreaker_1.circuitBreaker.canExecute()) {
            // Stale-While-Error Cache-First Defense
            if (cacheResult.value !== null) {
                let parsedData;
                try {
                    parsedData = JSON.parse(cacheResult.value);
                }
                catch {
                    parsedData = cacheResult.value;
                }
                const totalLatencyMs = Math.max(1, Date.now() - startTotalTime);
                return {
                    requestId,
                    objectId,
                    cacheHit: true,
                    backendCalled: false,
                    cacheLatencyMs,
                    backendLatencyMs: 0,
                    totalLatencyMs,
                    statusCode: 200,
                    data: parsedData,
                    responseSizeBytes: cacheResult.metadata?.sizeBytes || 0,
                    metadata: cacheResult.metadata,
                };
            }
            const totalLatencyMs = Date.now() - startTotalTime;
            const log = {
                requestId,
                timestamp: startTotalTime,
                objectId,
                operation: 'GET',
                responseSizeBytes: 0,
                cacheHit: false,
                backendCalled: false,
                backendLatencyMs: 0,
                cacheLatencyMs,
                totalLatencyMs,
                statusCode: 503,
                errorMessage: `${isDemo ? '[DEMO] ' : ''}Circuit Breaker is OPEN. Backend protection short-circuited request.`,
                source,
                mode: isDemo ? 'demo' : 'live',
            };
            await repositories_1.requestLogRepository.log(log);
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: startTotalTime,
                eventType: 'CIRCUIT-BREAKER',
                objectId,
                reason: `${isDemo ? '[DEMO] ' : ''}Circuit Breaker OPEN: request short-circuited to protect degraded backend`,
                source,
                mode: isDemo ? 'demo' : 'live',
            });
            return {
                requestId,
                objectId,
                cacheHit: false,
                backendCalled: false,
                cacheLatencyMs,
                backendLatencyMs: 0,
                totalLatencyMs,
                statusCode: 503,
                data: null,
                responseSizeBytes: 0,
                errorMessage: 'Service Unavailable (Circuit Breaker OPEN)',
            };
        }
        // 5. Fetch from Origin with Singleflight Coalescing, Request Queue & Retry Control
        let originResult;
        let wasCoalesced = false;
        try {
            const coalRes = await coalescing_1.coalescer.execute(cacheKey, async () => {
                return await requestQueue_1.requestQueue.enqueue(async () => {
                    return await retryController_1.retryController.executeWithRetry(async () => {
                        const fetchRes = await effectiveOriginAdapter.fetchObject(objectId, {
                            simulatedLatencyMs: options?.simulatedLatencyMs,
                            simulatedErrorRate: options?.simulatedErrorRate,
                        });
                        if (fetchRes.statusCode >= 500) {
                            throw new Error(`Origin backend error: HTTP ${fetchRes.statusCode}`);
                        }
                        return fetchRes;
                    });
                });
            });
            originResult = coalRes.result;
            wasCoalesced = coalRes.wasCoalesced;
        }
        catch (err) {
            originResult = {
                objectId,
                data: null,
                sizeBytes: 0,
                retrievalCostMs: options?.simulatedLatencyMs || 50,
                statusCode: err.message?.includes('404') ? 404 : 503,
                errorMessage: err.message || 'Origin fetch failed',
            };
        }
        const isSuccess = originResult.statusCode === 200 && originResult.data !== null;
        circuitBreaker_1.circuitBreaker.recordResult(isSuccess);
        const totalLatencyMs = Date.now() - startTotalTime;
        if (!isSuccess || !originResult.data) {
            // Origin lookup failed or 404
            const log = {
                requestId,
                timestamp: startTotalTime,
                objectId,
                operation: 'GET',
                responseSizeBytes: 0,
                cacheHit: false,
                backendCalled: true,
                backendLatencyMs: originResult.retrievalCostMs,
                cacheLatencyMs,
                totalLatencyMs,
                statusCode: originResult.statusCode,
                errorMessage: originResult.errorMessage || 'Origin lookup failed',
                wasCoalesced,
                source,
                mode: isDemo ? 'demo' : 'live',
            };
            await repositories_1.requestLogRepository.log(log);
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: startTotalTime,
                eventType: 'BACKEND-ERROR',
                objectId,
                reason: `${isDemo ? '[DEMO] ' : ''}${originResult.errorMessage || `Origin returned status code ${originResult.statusCode}`}`,
                source,
                mode: isDemo ? 'demo' : 'live',
            });
            return {
                requestId,
                objectId,
                cacheHit: false,
                backendCalled: true,
                cacheLatencyMs,
                backendLatencyMs: originResult.retrievalCostMs,
                totalLatencyMs,
                statusCode: originResult.statusCode,
                data: null,
                responseSizeBytes: 0,
                errorMessage: originResult.errorMessage || 'Origin query failed',
                wasCoalesced,
            };
        }
        // 6. Decision Engine & Multi-Factor Scoring for newly retrieved object
        const settings = await repositories_1.settingsRepository.getSettings();
        const pool = client_1.dbClient.getMetrics();
        const candidateMeta = {
            objectId,
            key: cacheKey,
            sizeBytes: originResult.sizeBytes,
            retrievalCostMs: originResult.retrievalCostMs,
            backendLatencyMs: originResult.retrievalCostMs,
            accessCount: 1,
            lastAccessed: Date.now(),
            createdAt: Date.now(),
        };
        const factors = scorer_1.scorer.calculateFactors(candidateMeta, settings, {
            poolUtilization: pool.utilization,
            queueDepth: pool.connectionQueueDepth,
            errorRate: circuitBreaker_1.circuitBreaker.getStats().errorRate,
            avgBackendLatencyMs: originResult.retrievalCostMs,
        });
        const evalResult = lifecycle_1.lifecycle.evaluate(candidateMeta, factors, settings, false);
        if (evalResult.decisionRecord) {
            evalResult.decisionRecord.source = source;
            evalResult.decisionRecord.mode = isDemo ? 'demo' : 'live';
            if (isDemo) {
                evalResult.decisionRecord.reason = `[DEMO] ${evalResult.decisionRecord.reason}`;
            }
        }
        await repositories_1.decisionRepository.log(evalResult.decisionRecord);
        const now = Date.now();
        const fullMetadata = {
            objectId,
            key: cacheKey,
            sizeBytes: originResult.sizeBytes,
            createdAt: now,
            updatedAt: now,
            lastAccessed: now,
            accessCount: 1,
            frequency: 1,
            recentAccessCount: 1,
            retrievalCostMs: originResult.retrievalCostMs,
            backendLatencyMs: originResult.retrievalCostMs,
            ttlSeconds: evalResult.newTtlSeconds,
            remainingTtlSeconds: evalResult.newTtlSeconds,
            expiresAt: now + (evalResult.newTtlSeconds * 1000),
            predictedDemand: factors.predictedDemand,
            confidence: factors.confidence,
            adaptiveScore: factors.finalScore,
            lastDecision: evalResult.decision,
            currentState: evalResult.decision,
            lastDecisionTime: now,
            isPreCached: evalResult.decision === 'PRE-CACHE',
        };
        // 7. Store in Redis Live Cache (Redis SET / SETEX)
        await redis_1.redisCache.set(cacheKey, JSON.stringify(originResult.data), fullMetadata, evalResult.newTtlSeconds);
        if (evalResult.decision === 'PRE-CACHE') {
            redis_1.redisCache.incrementPreCache();
            await repositories_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: now,
                eventType: 'PRE-CACHE',
                objectId,
                score: factors.finalScore,
                reason: `${isDemo ? '[DEMO] ' : ''}${evalResult.reason}`,
                source,
                mode: isDemo ? 'demo' : 'live',
            });
        }
        // 8. Store Request Log and Event for MISS
        const log = {
            requestId,
            timestamp: startTotalTime,
            objectId,
            operation: 'GET',
            responseSizeBytes: originResult.sizeBytes,
            cacheHit: false,
            backendCalled: true,
            backendLatencyMs: originResult.retrievalCostMs,
            cacheLatencyMs,
            totalLatencyMs,
            statusCode: 200,
            wasCoalesced,
            source,
            mode: isDemo ? 'demo' : 'live',
        };
        await repositories_1.requestLogRepository.log(log);
        await repositories_1.eventRepository.log({
            id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
            timestamp: now,
            eventType: 'CACHE-MISS',
            objectId,
            score: factors.finalScore,
            reason: `${isDemo ? '[DEMO] ' : ''}CACHE MISS: Fetched from origin (${originResult.sourceType}) in ${originResult.retrievalCostMs}ms and cached with TTL ${evalResult.newTtlSeconds}s`,
            source,
            mode: isDemo ? 'demo' : 'live',
        });
        return {
            requestId,
            objectId,
            cacheHit: false,
            backendCalled: true,
            cacheLatencyMs,
            backendLatencyMs: originResult.retrievalCostMs,
            totalLatencyMs,
            statusCode: 200,
            data: originResult.data,
            responseSizeBytes: originResult.sizeBytes,
            metadata: fullMetadata,
            wasCoalesced,
        };
    }
    /**
     * Background asynchronous refresh for high-value cache entities
     */
    async triggerBackgroundRefresh(objectId, cacheKey) {
        try {
            const originResult = await this.originAdapter.fetchObject(objectId);
            if (originResult.statusCode === 200 && originResult.data) {
                const settings = await repositories_1.settingsRepository.getSettings();
                const pool = client_1.dbClient.getMetrics();
                const factors = scorer_1.scorer.calculateFactors({
                    objectId,
                    sizeBytes: originResult.sizeBytes,
                    retrievalCostMs: originResult.retrievalCostMs,
                    backendLatencyMs: originResult.retrievalCostMs,
                    accessCount: 10,
                }, settings, {
                    poolUtilization: pool.utilization,
                    queueDepth: pool.connectionQueueDepth,
                    errorRate: 0,
                    avgBackendLatencyMs: originResult.retrievalCostMs,
                });
                const evalRes = lifecycle_1.lifecycle.evaluate({ objectId }, factors, settings, true);
                const now = Date.now();
                await redis_1.redisCache.set(cacheKey, JSON.stringify(originResult.data), {
                    objectId,
                    sizeBytes: originResult.sizeBytes,
                    retrievalCostMs: originResult.retrievalCostMs,
                    backendLatencyMs: originResult.retrievalCostMs,
                    ttlSeconds: evalRes.newTtlSeconds,
                    predictedDemand: factors.predictedDemand,
                    confidence: factors.confidence,
                    adaptiveScore: factors.finalScore,
                    lastDecision: 'REFRESH',
                    currentState: 'REFRESH',
                    updatedAt: now,
                }, evalRes.newTtlSeconds);
                await repositories_1.eventRepository.log({
                    id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                    timestamp: now,
                    eventType: 'REFRESH',
                    objectId,
                    score: factors.finalScore,
                    reason: `Background refresh succeeded. TTL extended by ${evalRes.newTtlSeconds}s`,
                });
            }
        }
        catch (err) {
            console.warn(`[CacheService] Background refresh error for ${objectId}:`, err.message);
        }
    }
}
exports.CacheService = CacheService;
exports.cacheService = new CacheService();
