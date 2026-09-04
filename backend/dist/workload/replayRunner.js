"use strict";
/**
 * Real Workload Trace Replay Engine (Phase 6 Traffic Lab)
 * Executes stored historical workload traces against the live cache engine.
 * Records actual requests, hits, misses, latency, backend calls, evictions, and errors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.replayRunner = exports.ReplayRunner = void 0;
const uuid_1 = require("uuid");
const workloadRepository_1 = require("../repositories/workloadRepository");
const eventRepository_1 = require("../repositories/eventRepository");
const cacheService_1 = require("../services/cacheService");
const redis_1 = require("../cache/redis");
class ReplayRunner {
    activeReplay = null;
    isRunning = false;
    isPaused = false;
    stopRequested = false;
    latencies = [];
    async startReplay(config) {
        if (this.isRunning) {
            await this.stopReplay();
        }
        const { workloadId, requestsPerSecond = 100, concurrency = 5, cacheCapacityMb, ttlSeconds, burstTraffic = false, speedMultiplier = 1.0, } = config;
        // 1. Fetch workload metadata and requests from repository
        const workload = await workloadRepository_1.workloadRepository.getWorkloadRunById(workloadId);
        if (!workload) {
            throw new Error(`Workload with ID "${workloadId}" not found.`);
        }
        const requests = await workloadRepository_1.workloadRepository.getWorkloadRequests(workloadId, 10000);
        if (requests.length === 0) {
            throw new Error(`Workload trace "${workloadId}" contains no requests to replay.`);
        }
        // 2. Configure Cache Capacity & Initial Cache State if specified
        if (cacheCapacityMb && cacheCapacityMb > 0) {
            redis_1.redisCache.setCapacity(cacheCapacityMb * 1024 * 1024);
        }
        const replayId = `REP-${(0, uuid_1.v4)().substring(0, 8)}`;
        this.latencies = [];
        this.isRunning = true;
        this.isPaused = false;
        this.stopRequested = false;
        this.activeReplay = {
            replayId,
            workloadId,
            filename: workload.filename,
            status: 'RUNNING',
            totalRequestsInTrace: requests.length,
            requestsCompleted: 0,
            cacheHits: 0,
            cacheMisses: 0,
            backendCalls: 0,
            evictionsCount: 0,
            errorsCount: 0,
            hitRate: 0,
            avgLatencyMs: 0,
            p50LatencyMs: 0,
            p95LatencyMs: 0,
            currentRps: requestsPerSecond,
            concurrency: Math.max(1, concurrency),
            startedAt: Date.now(),
        };
        // 3. Launch asynchronous replay execution worker pool
        eventRepository_1.eventRepository.log({
            id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
            timestamp: Date.now(),
            eventType: 'WORKLOAD_STARTED',
            reason: `Workload trace replay started: "${workload.filename}" (${requests.length} requests at ${requestsPerSecond} RPS)`,
            metadata: { workloadId, requestsCount: requests.length, concurrency },
        });
        this.executeReplayLoop(requests, requestsPerSecond, concurrency, burstTraffic, speedMultiplier);
        return { ...this.activeReplay };
    }
    async executeReplayLoop(requests, targetRps, concurrency, burstTraffic, speedMultiplier) {
        const effectiveRps = Math.max(1, Math.round(targetRps * (burstTraffic ? 3.0 : 1.0) * speedMultiplier));
        const intervalMs = Math.max(1, Math.floor(1000 / effectiveRps));
        const poolSize = Math.max(1, concurrency);
        let currentIndex = 0;
        const total = requests.length;
        // Worker pool execution
        const runWorker = async () => {
            while (currentIndex < total && this.isRunning && !this.stopRequested) {
                if (this.isPaused) {
                    await new Promise(r => setTimeout(r, 100));
                    continue;
                }
                const reqIndex = currentIndex++;
                if (reqIndex >= total)
                    break;
                const req = requests[reqIndex];
                const startReqTime = Date.now();
                try {
                    // Execute real request against cache engine
                    const result = await cacheService_1.cacheService.handleRequest(req.objectId, {
                        simulatedLatencyMs: req.backendLatencyMs || req.backend_latency,
                    });
                    const reqLatency = result.totalLatencyMs || Math.max(1, Date.now() - startReqTime);
                    this.latencies.push(reqLatency);
                    if (this.activeReplay) {
                        this.activeReplay.requestsCompleted++;
                        if (result.cacheHit) {
                            this.activeReplay.cacheHits++;
                        }
                        else {
                            this.activeReplay.cacheMisses++;
                        }
                        if (result.backendCalled) {
                            this.activeReplay.backendCalls++;
                        }
                        if (result.statusCode >= 400) {
                            this.activeReplay.errorsCount++;
                        }
                        // Update running stats
                        const totalProcessed = this.activeReplay.requestsCompleted;
                        this.activeReplay.hitRate = totalProcessed > 0
                            ? Math.round((this.activeReplay.cacheHits / totalProcessed) * 1000) / 1000
                            : 0;
                        const totalLatency = this.latencies.reduce((a, b) => a + b, 0);
                        this.activeReplay.avgLatencyMs = Math.round(totalLatency / this.latencies.length);
                        // Compute percentiles every 10 requests
                        if (totalProcessed % 10 === 0) {
                            const sorted = [...this.latencies].sort((a, b) => a - b);
                            this.activeReplay.p50LatencyMs = sorted[Math.floor(sorted.length * 0.50)] || 0;
                            this.activeReplay.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
                            this.activeReplay.evictionsCount = redis_1.redisCache.getStats().adaptiveEvictions;
                        }
                    }
                }
                catch (err) {
                    if (this.activeReplay) {
                        this.activeReplay.requestsCompleted++;
                        this.activeReplay.errorsCount++;
                    }
                }
                // Delay to maintain target throughput
                if (intervalMs > 0) {
                    await new Promise(r => setTimeout(r, intervalMs / poolSize));
                }
            }
        };
        // Spawn concurrent workers
        const workers = Array.from({ length: poolSize }, () => runWorker());
        await Promise.all(workers);
        // Finalize replay run
        if (this.activeReplay) {
            if (this.stopRequested) {
                this.activeReplay.status = 'STOPPED';
            }
            else {
                this.activeReplay.status = 'COMPLETED';
            }
            this.activeReplay.completedAt = Date.now();
            const sorted = [...this.latencies].sort((a, b) => a - b);
            if (sorted.length > 0) {
                this.activeReplay.p50LatencyMs = sorted[Math.floor(sorted.length * 0.50)] || 0;
                this.activeReplay.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
            }
            this.activeReplay.evictionsCount = redis_1.redisCache.getStats().adaptiveEvictions;
            eventRepository_1.eventRepository.log({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: Date.now(),
                eventType: 'WORKLOAD_COMPLETED',
                reason: `Workload trace replay completed: ${this.activeReplay.requestsCompleted} requests (${this.activeReplay.cacheHits} hits, ${this.activeReplay.cacheMisses} misses)`,
                metadata: { ...this.activeReplay },
            });
        }
        this.isRunning = false;
    }
    async stopReplay() {
        this.stopRequested = true;
        this.isRunning = false;
        this.isPaused = false;
        if (this.activeReplay) {
            this.activeReplay.status = 'STOPPED';
            this.activeReplay.completedAt = Date.now();
            return { ...this.activeReplay };
        }
        return null;
    }
    async pauseReplay() {
        if (this.isRunning) {
            this.isPaused = true;
            if (this.activeReplay) {
                this.activeReplay.status = 'PAUSED';
                return { ...this.activeReplay };
            }
        }
        return null;
    }
    async resumeReplay() {
        if (this.isRunning && this.isPaused) {
            this.isPaused = false;
            if (this.activeReplay) {
                this.activeReplay.status = 'RUNNING';
                return { ...this.activeReplay };
            }
        }
        return null;
    }
    getStatus() {
        if (!this.activeReplay)
            return null;
        return { ...this.activeReplay };
    }
    isReplaying() {
        return this.isRunning;
    }
}
exports.ReplayRunner = ReplayRunner;
exports.replayRunner = new ReplayRunner();
