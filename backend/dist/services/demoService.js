"use strict";
/**
 * Safe Demo Runner Service for ADAPTIVECACHE
 * Executes deterministic test workloads through the real AdaptiveCache backend pipeline:
 * CacheService -> Redis (adaptivecache:demo:*) -> Origin MISS -> Demo Origin Data Source -> Redis SET -> Multi-Factor Scorer -> PostgreSQL logging.
 *
 * Strict isolation: Does NOT use Math.random(), fake changing metrics, or pollute live data.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoService = exports.DemoService = void 0;
const cacheService_1 = require("./cacheService");
const redis_1 = require("../cache/redis");
const repositories_1 = require("../repositories");
const db_1 = require("../db");
const server_1 = require("../ws/server");
const demoFixtures_1 = require("./demoFixtures");
class DemoService {
    isDemoMode = false;
    isRunning = false;
    currentScenario = null;
    totalRequests = 0;
    hits = 0;
    misses = 0;
    lastRunAt = null;
    stopRequested = false;
    getStatus() {
        const total = this.hits + this.misses;
        return {
            isDemoMode: this.isDemoMode,
            isRunning: this.isRunning,
            currentScenario: this.currentScenario,
            totalRequests: this.totalRequests,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? Math.round((this.hits / total) * 1000) / 1000 : 0,
            lastRunAt: this.lastRunAt,
            activeNamespace: 'adaptivecache:demo:*',
        };
    }
    setDemoMode(enabled) {
        this.isDemoMode = enabled;
    }
    getScenarios() {
        return Object.values(demoFixtures_1.DEMO_SCENARIOS);
    }
    /**
     * Start a deterministic demo scenario
     */
    async start(scenarioId = 'BASIC_CACHE', options) {
        const scenario = demoFixtures_1.DEMO_SCENARIOS[scenarioId] || demoFixtures_1.DEMO_SCENARIOS.BASIC_CACHE;
        this.isDemoMode = true;
        this.isRunning = true;
        this.currentScenario = scenarioId;
        this.stopRequested = false;
        this.lastRunAt = Date.now();
        const startTime = Date.now();
        const multiplier = options?.multiplier ?? scenario.options?.multiplier ?? 1;
        const effectiveCapacity = options?.cacheCapacityBytes ?? scenario.options?.cacheCapacityBytes;
        const simulatedLatencyMs = options?.simulatedLatencyMs ?? scenario.options?.simulatedLatencyMs;
        const simulatedErrorRate = options?.simulatedErrorRate ?? scenario.options?.simulatedErrorRate;
        // Apply capacity constraint for CACHE_PRESSURE scenario if specified
        const originalCapacity = redis_1.redisCache.getCapacity();
        if (effectiveCapacity) {
            redis_1.redisCache.setCapacity(effectiveCapacity);
        }
        // Build deterministic request queue
        const baseSequence = scenario.sequence;
        const fullSequence = [];
        for (let m = 0; m < multiplier; m++) {
            fullSequence.push(...baseSequence);
        }
        const requestsBreakdown = [];
        let scenarioHits = 0;
        let scenarioMisses = 0;
        let backendCalls = 0;
        const latencies = [];
        // Broadcast demo start event
        try {
            server_1.wsService.broadcast({
                type: 'DEMO_WORKLOAD_STARTED',
                data: {
                    scenarioId,
                    totalPlanned: fullSequence.length,
                    namespace: 'adaptivecache:demo:*',
                },
            });
        }
        catch { }
        // Execute requests through the REAL AdaptiveCache request pipeline
        for (const objectId of fullSequence) {
            if (this.stopRequested) {
                break;
            }
            const reqRes = await cacheService_1.cacheService.handleRequest(objectId, {
                mode: 'demo',
                simulatedLatencyMs,
                simulatedErrorRate,
                bypassRateLimiter: false,
            });
            this.totalRequests++;
            latencies.push(reqRes.totalLatencyMs);
            if (reqRes.cacheHit) {
                this.hits++;
                scenarioHits++;
            }
            else {
                this.misses++;
                scenarioMisses++;
            }
            if (reqRes.backendCalled) {
                backendCalls++;
            }
            requestsBreakdown.push({
                objectId,
                hit: reqRes.cacheHit,
                backendCalled: reqRes.backendCalled,
                latencyMs: reqRes.totalLatencyMs,
                statusCode: reqRes.statusCode,
                decision: reqRes.metadata?.lastDecision || (reqRes.cacheHit ? 'KEEP' : 'FETCH'),
            });
            // Small pacing delay for real-time visibility (10ms)
            if (fullSequence.length > 5 && multiplier <= 2) {
                await new Promise(r => setTimeout(r, 10));
            }
        }
        // Restore original capacity if changed
        if (effectiveCapacity) {
            redis_1.redisCache.setCapacity(originalCapacity);
        }
        this.isRunning = false;
        const durationMs = Date.now() - startTime;
        const totalProcessed = scenarioHits + scenarioMisses;
        const hitRate = totalProcessed > 0 ? scenarioHits / totalProcessed : 0;
        // Calculate latency percentiles from actual recorded requests
        latencies.sort((a, b) => a - b);
        const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
        const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
        const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
        const result = {
            scenarioId,
            scenarioTitle: scenario.title,
            totalRequests: totalProcessed,
            hits: scenarioHits,
            misses: scenarioMisses,
            hitRate: Math.round(hitRate * 1000) / 1000,
            backendCalls,
            avgLatencyMs: Math.round(avgLatency * 10) / 10,
            p95LatencyMs: Math.round(p95 * 10) / 10,
            p99LatencyMs: Math.round(p99 * 10) / 10,
            durationMs,
            decisionsCount: requestsBreakdown.length,
            evictionsCount: redis_1.redisCache.getStats().adaptiveEvictions,
            namespace: 'adaptivecache:demo:*',
            requestsBreakdown,
        };
        // Broadcast completion
        try {
            server_1.wsService.broadcast({
                type: 'DEMO_WORKLOAD_COMPLETED',
                data: result,
            });
        }
        catch { }
        return result;
    }
    /**
     * Stop currently running demo workload
     */
    stop() {
        this.stopRequested = true;
        this.isRunning = false;
        return {
            success: true,
            message: 'Demo workload stopped.',
        };
    }
    /**
     * Reset Demo Mode: purges ONLY demo Redis keys and demo database records.
     * Never touches live/production data.
     */
    async reset() {
        this.stopRequested = true;
        this.isRunning = false;
        this.hits = 0;
        this.misses = 0;
        this.totalRequests = 0;
        this.currentScenario = null;
        // 1. Clear ONLY demo Redis namespace keys
        const clearedRedisKeys = await redis_1.redisCache.clearDemoKeys();
        // 2. Clear ONLY demo database records
        const clearedLogs = await repositories_1.requestLogRepository.clearDemoLogs();
        const clearedEvents = await repositories_1.eventRepository.clearDemoEvents();
        const clearedDecisions = await repositories_1.decisionRepository.clearDemoDecisions();
        await db_1.db.clearDemoData();
        // Broadcast reset event
        try {
            server_1.wsService.broadcast({
                type: 'DEMO_RESET',
                data: { clearedRedisKeys, clearedLogs, clearedEvents, clearedDecisions },
            });
        }
        catch { }
        return {
            success: true,
            clearedRedisKeys,
            clearedLogs,
            clearedEvents,
            clearedDecisions,
        };
    }
}
exports.DemoService = DemoService;
exports.demoService = new DemoService();
