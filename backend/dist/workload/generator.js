"use strict";
/**
 * Real Workload Generator & Traffic Lab Engine
 * Generates actual HTTP/internal requests through the pipeline with realistic
 * access distributions (Zipfian skew, popularity shifts, spikes, cold starts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workloadGenerator = exports.WorkloadGenerator = void 0;
const uuid_1 = require("uuid");
const pipeline_1 = require("../pipeline");
const redis_1 = require("../cache/redis");
const db_1 = require("../db");
const circuitBreaker_1 = require("../protection/circuitBreaker");
class WorkloadGenerator {
    activeRun = null;
    isRunning = false;
    intervalTimer = null;
    recordedTrace = [];
    // Deterministic Zipfian generator
    getZipfianIndex(n, alpha = 1.05) {
        // Generate Zipf-distributed integer in [1, n]
        const z = Math.random();
        // Generalized harmonic approximation
        const c = 1.0 / Array.from({ length: n }, (_, i) => Math.pow(1 / (i + 1), alpha)).reduce((a, b) => a + b, 0);
        let sum = 0;
        for (let i = 1; i <= n; i++) {
            sum += c * Math.pow(1 / i, alpha);
            if (z <= sum) {
                return i;
            }
        }
        return n;
    }
    /**
     * Start executing a live workload
     */
    async startWorkload(config) {
        if (this.isRunning) {
            await this.stopWorkload();
        }
        const runId = `RUN-${(0, uuid_1.v4)().substring(0, 8)}`;
        const traceId = `TRACE-${(0, uuid_1.v4)().substring(0, 8)}`;
        // Set cache capacity if specified
        if (config.cacheCapacityMb > 0) {
            redis_1.redisCache.setCapacity(config.cacheCapacityMb * 1024 * 1024);
        }
        // If Cold Start, flush cache
        if (config.type === 'COLD_START') {
            redis_1.redisCache.flushall();
            redis_1.redisCache.resetCounters();
            circuitBreaker_1.circuitBreaker.reset();
            db_1.db.logEvent({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: Date.now(),
                eventType: 'EVICT',
                reason: 'Cold Start initiated: cache storage flushed for zero-state warming benchmark',
            });
        }
        this.activeRun = {
            id: runId,
            config,
            status: 'RUNNING',
            startedAt: Date.now(),
            totalRequestsGenerated: 0,
            requestsCompleted: 0,
            averageHitRate: 0,
            averageLatencyMs: 0,
            traceId,
        };
        this.isRunning = true;
        this.recordedTrace = [];
        db_1.db.saveWorkloadRun(this.activeRun);
        const rps = Math.max(1, Math.round(config.requestsPerSecond * (config.trafficMultiplier || 1.0)));
        const intervalMs = Math.max(10, Math.floor(1000 / rps));
        const objectCount = Math.min(500, Math.max(10, config.objectCount || 100));
        const durationMs = (config.durationSeconds || 30) * 1000;
        const startTime = Date.now();
        let popularityShiftOffset = 0;
        let tickCount = 0;
        this.intervalTimer = setInterval(async () => {
            if (!this.isRunning || !this.activeRun)
                return;
            const elapsed = Date.now() - startTime;
            if (elapsed >= durationMs) {
                await this.stopWorkload();
                return;
            }
            tickCount++;
            // Determine object ID based on workload type
            let objectIndex = 1;
            switch (config.type) {
                case 'STEADY_LOAD': {
                    objectIndex = this.getZipfianIndex(objectCount, 1.05);
                    break;
                }
                case 'TRAFFIC_SPIKE': {
                    // 85% of traffic targets 3 specific hot keys (Product_7, Product_42, Product_108)
                    if (Math.random() < 0.85) {
                        const hotKeys = [7, 42, 108];
                        objectIndex = hotKeys[Math.floor(Math.random() * hotKeys.length)];
                    }
                    else {
                        objectIndex = this.getZipfianIndex(objectCount, 0.9);
                    }
                    break;
                }
                case 'POPULARITY_SHIFT': {
                    // Every 5 seconds, drift the hot set center by 25 positions
                    if (tickCount % 50 === 0) {
                        popularityShiftOffset = (popularityShiftOffset + 25) % (objectCount - 30);
                    }
                    const rawZipf = this.getZipfianIndex(30, 1.2);
                    objectIndex = ((rawZipf + popularityShiftOffset) % objectCount) + 1;
                    break;
                }
                case 'COLD_START': {
                    objectIndex = (tickCount % objectCount) + 1;
                    break;
                }
                case 'BACKEND_DEGRADATION': {
                    objectIndex = this.getZipfianIndex(objectCount, 1.0);
                    break;
                }
                case 'COMPUTE_HEAVY': {
                    // Targets high-cost items (Server and GPU categories, indexes 1-100)
                    objectIndex = (this.getZipfianIndex(100, 1.1)) % 100 + 1;
                    break;
                }
                case 'READ_HEAVY': {
                    objectIndex = this.getZipfianIndex(objectCount, 1.4); // highly skewed Zipfian
                    break;
                }
                case 'WRITE_HEAVY': {
                    objectIndex = Math.floor(Math.random() * objectCount) + 1;
                    // Invalidate key occasionally
                    if (Math.random() < 0.25) {
                        redis_1.redisCache.del(`product:Product_${objectIndex}`);
                    }
                    break;
                }
                default:
                    objectIndex = this.getZipfianIndex(objectCount, 1.0);
            }
            const objectId = `Product_${objectIndex}`;
            this.activeRun.totalRequestsGenerated++;
            // Dispatch real request through the pipeline
            const latencyOverride = config.type === 'BACKEND_DEGRADATION' ? (config.backendLatencyMs || 350) : config.backendLatencyMs;
            const errorOverride = config.type === 'BACKEND_DEGRADATION' ? (config.backendErrorRate || 0.35) : config.backendErrorRate;
            try {
                const result = await pipeline_1.pipeline.processProductRequest(objectId, latencyOverride, errorOverride);
                if (this.activeRun) {
                    this.activeRun.requestsCompleted++;
                }
            }
            catch (err) {
                console.warn('[Workload] Request execution error:', err.message);
            }
        }, intervalMs);
        return this.activeRun;
    }
    /**
     * Stop currently running workload
     */
    async stopWorkload() {
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
            this.intervalTimer = null;
        }
        if (this.activeRun) {
            this.activeRun.status = 'COMPLETED';
            this.activeRun.completedAt = Date.now();
            db_1.db.saveWorkloadRun(this.activeRun);
        }
        this.isRunning = false;
        const finished = this.activeRun;
        this.activeRun = null;
        return finished;
    }
    getActiveRun() {
        return this.activeRun;
    }
    isWorkloadRunning() {
        return this.isRunning;
    }
}
exports.WorkloadGenerator = WorkloadGenerator;
exports.workloadGenerator = new WorkloadGenerator();
