/**
 * Safe Demo Runner Service for ADAPTIVECACHE
 * Executes deterministic test workloads through the real AdaptiveCache backend pipeline:
 * CacheService -> Redis (adaptivecache:demo:*) -> Origin MISS -> Demo Origin Data Source -> Redis SET -> Multi-Factor Scorer -> PostgreSQL logging.
 * 
 * Strict isolation: Does NOT use Math.random(), fake changing metrics, or pollute live data.
 */

import { cacheService } from './cacheService';
import { redisCache } from '../cache/redis';
import {
  requestLogRepository,
  eventRepository,
  decisionRepository,
} from '../repositories';
import { db } from '../db';
import { wsService } from '../ws/server';
import {
  DEMO_SCENARIOS,
  DEMO_FIXTURES,
  DemoScenarioType,
  DemoScenarioDefinition,
} from './demoFixtures';

export interface DemoExecutionResult {
  scenarioId: DemoScenarioType;
  scenarioTitle: string;
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  backendCalls: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  durationMs: number;
  decisionsCount: number;
  evictionsCount: number;
  namespace: string;
  requestsBreakdown: Array<{
    objectId: string;
    hit: boolean;
    backendCalled: boolean;
    latencyMs: number;
    statusCode: number;
    decision?: string;
  }>;
}

export interface DemoStatus {
  isDemoMode: boolean;
  isRunning: boolean;
  currentScenario: DemoScenarioType | null;
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  lastRunAt: number | null;
  activeNamespace: string;
}

export class DemoService {
  private isDemoMode: boolean = false;
  private isRunning: boolean = false;
  private currentScenario: DemoScenarioType | null = null;
  private totalRequests: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private lastRunAt: number | null = null;
  private stopRequested: boolean = false;

  public getStatus(): DemoStatus {
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

  public setDemoMode(enabled: boolean): void {
    this.isDemoMode = enabled;
  }

  public getScenarios(): DemoScenarioDefinition[] {
    return Object.values(DEMO_SCENARIOS);
  }

  /**
   * Start a deterministic demo scenario
   */
  public async start(
    scenarioId: DemoScenarioType = 'BASIC_CACHE',
    options?: {
      multiplier?: number;
      cacheCapacityBytes?: number;
      simulatedLatencyMs?: number;
      simulatedErrorRate?: number;
    }
  ): Promise<DemoExecutionResult> {
    const scenario = DEMO_SCENARIOS[scenarioId] || DEMO_SCENARIOS.BASIC_CACHE;
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
    const originalCapacity = redisCache.getCapacity();
    if (effectiveCapacity) {
      redisCache.setCapacity(effectiveCapacity);
    }

    // Build deterministic request queue
    const baseSequence = scenario.sequence;
    const fullSequence: string[] = [];
    for (let m = 0; m < multiplier; m++) {
      fullSequence.push(...baseSequence);
    }

    const requestsBreakdown: DemoExecutionResult['requestsBreakdown'] = [];
    let scenarioHits = 0;
    let scenarioMisses = 0;
    let backendCalls = 0;
    const latencies: number[] = [];

    // Broadcast demo start event
    try {
      wsService.broadcast({
        type: 'DEMO_WORKLOAD_STARTED',
        data: {
          scenarioId,
          totalPlanned: fullSequence.length,
          namespace: 'adaptivecache:demo:*',
        },
      });
    } catch {}

    // Execute requests through the REAL AdaptiveCache request pipeline
    for (const objectId of fullSequence) {
      if (this.stopRequested) {
        break;
      }

      const reqRes = await cacheService.handleRequest(objectId, {
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
      } else {
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
      redisCache.setCapacity(originalCapacity);
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

    const result: DemoExecutionResult = {
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
      evictionsCount: redisCache.getStats().adaptiveEvictions,
      namespace: 'adaptivecache:demo:*',
      requestsBreakdown,
    };

    // Broadcast completion
    try {
      wsService.broadcast({
        type: 'DEMO_WORKLOAD_COMPLETED',
        data: result,
      });
    } catch {}

    return result;
  }

  /**
   * Stop currently running demo workload
   */
  public stop(): { success: boolean; message: string } {
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
  public async reset(): Promise<{
    success: boolean;
    clearedRedisKeys: number;
    clearedLogs: number;
    clearedEvents: number;
    clearedDecisions: number;
  }> {
    this.stopRequested = true;
    this.isRunning = false;
    this.hits = 0;
    this.misses = 0;
    this.totalRequests = 0;
    this.currentScenario = null;

    // 1. Clear ONLY demo Redis namespace keys
    const clearedRedisKeys = await redisCache.clearDemoKeys();

    // 2. Clear ONLY demo database records
    const clearedLogs = await requestLogRepository.clearDemoLogs();
    const clearedEvents = await eventRepository.clearDemoEvents();
    const clearedDecisions = await decisionRepository.clearDemoDecisions();
    await db.clearDemoData();

    // Broadcast reset event
    try {
      wsService.broadcast({
        type: 'DEMO_RESET',
        data: { clearedRedisKeys, clearedLogs, clearedEvents, clearedDecisions },
      });
    } catch {}

    return {
      success: true,
      clearedRedisKeys,
      clearedLogs,
      clearedEvents,
      clearedDecisions,
    };
  }
}

export const demoService = new DemoService();
