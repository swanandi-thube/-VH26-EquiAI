/**
 * Real Workload Trace Replay Engine (Phase 6 Traffic Lab)
 * Executes stored historical workload traces against the live cache engine.
 * Records actual requests, hits, misses, latency, backend calls, evictions, and errors.
 */

import { v4 as uuidv4 } from 'uuid';
import { ReplayConfig, ReplayMetrics } from '../types';
import { workloadRepository } from '../repositories/workloadRepository';
import { cacheService } from '../services/cacheService';
import { redisCache } from '../cache/redis';

export class ReplayRunner {
  private activeReplay: ReplayMetrics | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private stopRequested: boolean = false;
  private latencies: number[] = [];

  public async startReplay(config: ReplayConfig): Promise<ReplayMetrics> {
    if (this.isRunning) {
      await this.stopReplay();
    }

    const {
      workloadId,
      requestsPerSecond = 100,
      concurrency = 5,
      cacheCapacityMb,
      ttlSeconds,
      burstTraffic = false,
      speedMultiplier = 1.0,
    } = config;

    // 1. Fetch workload metadata and requests from repository
    const workload = await workloadRepository.getWorkloadRunById(workloadId);
    if (!workload) {
      throw new Error(`Workload with ID "${workloadId}" not found.`);
    }

    const requests = await workloadRepository.getWorkloadRequests(workloadId, 10000);
    if (requests.length === 0) {
      throw new Error(`Workload trace "${workloadId}" contains no requests to replay.`);
    }

    // 2. Configure Cache Capacity & Initial Cache State if specified
    if (cacheCapacityMb && cacheCapacityMb > 0) {
      redisCache.setCapacity(cacheCapacityMb * 1024 * 1024);
    }

    const replayId = `REP-${uuidv4().substring(0, 8)}`;
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
    this.executeReplayLoop(requests, requestsPerSecond, concurrency, burstTraffic, speedMultiplier);

    return { ...this.activeReplay };
  }

  private async executeReplayLoop(
    requests: any[],
    targetRps: number,
    concurrency: number,
    burstTraffic: boolean,
    speedMultiplier: number
  ) {
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
        if (reqIndex >= total) break;

        const req = requests[reqIndex];
        const startReqTime = Date.now();

        try {
          // Execute real request against cache engine
          const result = await cacheService.handleRequest(req.objectId, {
            simulatedLatencyMs: req.backendLatencyMs || req.backend_latency,
          });

          const reqLatency = result.totalLatencyMs || Math.max(1, Date.now() - startReqTime);
          this.latencies.push(reqLatency);

          if (this.activeReplay) {
            this.activeReplay.requestsCompleted++;
            if (result.cacheHit) {
              this.activeReplay.cacheHits++;
            } else {
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
              this.activeReplay.evictionsCount = redisCache.getStats().adaptiveEvictions;
            }
          }
        } catch (err: any) {
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
      } else {
        this.activeReplay.status = 'COMPLETED';
      }
      this.activeReplay.completedAt = Date.now();
      const sorted = [...this.latencies].sort((a, b) => a - b);
      if (sorted.length > 0) {
        this.activeReplay.p50LatencyMs = sorted[Math.floor(sorted.length * 0.50)] || 0;
        this.activeReplay.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
      }
      this.activeReplay.evictionsCount = redisCache.getStats().adaptiveEvictions;
    }

    this.isRunning = false;
  }

  public async stopReplay(): Promise<ReplayMetrics | null> {
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

  public async pauseReplay(): Promise<ReplayMetrics | null> {
    if (this.isRunning) {
      this.isPaused = true;
      if (this.activeReplay) {
        this.activeReplay.status = 'PAUSED';
        return { ...this.activeReplay };
      }
    }
    return null;
  }

  public async resumeReplay(): Promise<ReplayMetrics | null> {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      if (this.activeReplay) {
        this.activeReplay.status = 'RUNNING';
        return { ...this.activeReplay };
      }
    }
    return null;
  }

  public getStatus(): ReplayMetrics | null {
    if (!this.activeReplay) return null;
    return { ...this.activeReplay };
  }

  public isReplaying(): boolean {
    return this.isRunning;
  }
}

export const replayRunner = new ReplayRunner();
