/**
 * Real Request Pipeline for ADAPTIVECACHE
 * Client -> Rate Limiter -> Redis -> Singleflight Coalescer -> Circuit Breaker -> Database -> Scorer & Dynamic TTL -> Cache SET -> Telemetry
 */

import { v4 as uuidv4 } from 'uuid';
import { db, ProductRecord } from '../db';
import { redisCache } from '../cache/redis';
import { rateLimiter } from '../protection/rateLimiter';
import { circuitBreaker } from '../protection/circuitBreaker';
import { coalescer } from '../protection/coalescing';
import { poolMonitor } from '../protection/connectionPool';
import { scorer } from '../engine/scorer';
import { lifecycle } from '../engine/lifecycle';
import { predictor } from '../engine/predictor';
import { RequestLog, CacheObjectMetadata } from '../types';

export interface PipelineResult {
  requestId: string;
  objectId: string;
  statusCode: number;
  data: ProductRecord | null;
  cacheHit: boolean;
  wasCoalesced: boolean;
  backendLatencyMs: number;
  totalLatencyMs: number;
  decision?: string;
  adaptiveScore?: number;
  errorMessage?: string;
}

export class RequestPipeline {
  /**
   * Main pipeline request processor
   */
  public async processProductRequest(
    objectId: string,
    simulatedLatencyMs?: number,
    simulatedErrorRate?: number
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const requestId = `REQ-${uuidv4().substring(0, 8)}`;
    const cacheKey = `product:${objectId}`;

    // 1. Rate Limiter Check
    if (!rateLimiter.tryAcquire(1)) {
      const totalLatency = Date.now() - startTime;
      const log: RequestLog = {
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
      db.logRequest(log);
      db.logEvent({
        id: `EVT-${uuidv4().substring(0, 8)}`,
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

    // 2. Record Access in Predictor
    predictor.recordAccess(objectId, startTime);

    // 3. Redis Cache Check
    const cacheResult = await redisCache.get(cacheKey);

    if (cacheResult.hit && cacheResult.value) {
      // --- CACHE HIT ---
      let parsedData: ProductRecord | null = null;
      try {
        parsedData = JSON.parse(cacheResult.value);
      } catch {
        parsedData = null;
      }

      const totalLatency = Math.max(1, Date.now() - startTime);

      // Evaluate lifecycle for active item (e.g. background REFRESH if TTL is running out)
      const currentMeta = cacheResult.metadata!;
      const settings = db.getSettings();
      const pool = db.getPoolMetrics();
      const factors = scorer.calculateFactors(currentMeta, settings, {
        poolUtilization: pool.utilization,
        queueDepth: pool.connectionQueueDepth,
        errorRate: circuitBreaker.getStats().errorRate,
        avgBackendLatencyMs: 50,
      });

      const evalResult = lifecycle.evaluate(currentMeta, factors, settings, true);
      redisCache.updateMetadata(cacheKey, {
        adaptiveScore: factors.finalScore,
        predictedDemand: factors.predictedDemand,
        confidence: factors.confidence,
        lastDecision: evalResult.decision,
        lastDecisionTime: Date.now(),
      });

      // If decision is REFRESH, trigger async background fetch to refresh before expiration
      if (evalResult.decision === 'REFRESH') {
        redisCache.incrementRefresh();
        this.triggerBackgroundRefresh(objectId, cacheKey);
      }

      const log: RequestLog = {
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
      db.logRequest(log);

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
    if (!circuitBreaker.canExecute()) {
      const totalLatency = Date.now() - startTime;
      const log: RequestLog = {
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
      db.logRequest(log);
      db.logEvent({
        id: `EVT-${uuidv4().substring(0, 8)}`,
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
    const { result: backendResponse, wasCoalesced } = await coalescer.execute(cacheKey, async () => {
      return await db.getProductById(objectId, simulatedLatencyMs, simulatedErrorRate);
    });

    const isSuccess = backendResponse.statusCode === 200 && backendResponse.product !== null;
    circuitBreaker.recordResult(isSuccess);

    const totalLatency = Date.now() - startTime;

    if (!isSuccess || !backendResponse.product) {
      const log: RequestLog = {
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
      db.logRequest(log);
      db.logEvent({
        id: `EVT-${uuidv4().substring(0, 8)}`,
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
    const product = backendResponse.product;
    const settings = db.getSettings();
    const pool = db.getPoolMetrics();
    poolMonitor.updateReplicaLoad(pool.activeConnections, 1.0);

    const candidateMeta: Partial<CacheObjectMetadata> = {
      objectId,
      key: cacheKey,
      sizeBytes: product.sizeBytes,
      retrievalCostMs: product.baseRetrievalCostMs,
      backendLatencyMs: backendResponse.latencyMs,
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    const factors = scorer.calculateFactors(candidateMeta, settings, {
      poolUtilization: pool.utilization,
      queueDepth: pool.connectionQueueDepth,
      errorRate: circuitBreaker.getStats().errorRate,
      avgBackendLatencyMs: backendResponse.latencyMs,
    });

    const evalResult = lifecycle.evaluate(candidateMeta as any, factors, settings, false);
    db.logDecision(evalResult.decisionRecord);

    // 7. Store in Redis with dynamic TTL & metadata
    await redisCache.set(
      cacheKey,
      JSON.stringify(product),
      {
        objectId,
        sizeBytes: product.sizeBytes,
        retrievalCostMs: product.baseRetrievalCostMs,
        backendLatencyMs: backendResponse.latencyMs,
        ttlSeconds: evalResult.newTtlSeconds,
        predictedDemand: factors.predictedDemand,
        confidence: factors.confidence,
        adaptiveScore: factors.finalScore,
        lastDecision: evalResult.decision,
        isPreCached: evalResult.decision === 'PRE-CACHE',
      },
      evalResult.newTtlSeconds
    );

    if (evalResult.decision === 'PRE-CACHE') {
      redisCache.incrementPreCache();
      db.logEvent({
        id: `EVT-${uuidv4().substring(0, 8)}`,
        timestamp: Date.now(),
        eventType: 'PRE-CACHE',
        objectId,
        score: factors.finalScore,
        reason: evalResult.reason,
      });
    }

    const log: RequestLog = {
      requestId,
      timestamp: startTime,
      objectId,
      operation: 'GET',
      responseSizeBytes: product.sizeBytes,
      cacheHit: false,
      backendLatencyMs: backendResponse.latencyMs,
      totalLatencyMs: totalLatency,
      statusCode: 200,
      wasCoalesced,
    };
    db.logRequest(log);

    return {
      requestId,
      objectId,
      statusCode: 200,
      data: product,
      cacheHit: false,
      wasCoalesced,
      backendLatencyMs: backendResponse.latencyMs,
      totalLatencyMs: totalLatency,
      decision: evalResult.decision,
      adaptiveScore: factors.finalScore,
    };
  }

  /**
   * Asynchronous background refresh for high-value items approaching expiration
   */
  private async triggerBackgroundRefresh(objectId: string, cacheKey: string) {
    try {
      const res = await db.getProductById(objectId);
      if (res.product) {
        const settings = db.getSettings();
        const pool = db.getPoolMetrics();
        const factors = scorer.calculateFactors(
          {
            objectId,
            sizeBytes: res.product.sizeBytes,
            retrievalCostMs: res.product.baseRetrievalCostMs,
            backendLatencyMs: res.latencyMs,
            accessCount: 10,
          },
          settings,
          {
            poolUtilization: pool.utilization,
            queueDepth: pool.connectionQueueDepth,
            errorRate: 0,
            avgBackendLatencyMs: res.latencyMs,
          }
        );
        const evalRes = lifecycle.evaluate({ objectId } as any, factors, settings, true);
        await redisCache.set(
          cacheKey,
          JSON.stringify(res.product),
          {
            objectId,
            sizeBytes: res.product.sizeBytes,
            retrievalCostMs: res.product.baseRetrievalCostMs,
            backendLatencyMs: res.latencyMs,
            ttlSeconds: evalRes.newTtlSeconds,
            predictedDemand: factors.predictedDemand,
            confidence: factors.confidence,
            adaptiveScore: factors.finalScore,
            lastDecision: 'REFRESH',
          },
          evalRes.newTtlSeconds
        );
        db.logEvent({
          id: `EVT-${uuidv4().substring(0, 8)}`,
          timestamp: Date.now(),
          eventType: 'REFRESH',
          objectId,
          score: factors.finalScore,
          reason: `Background refresh succeeded. TTL extended by ${evalRes.newTtlSeconds}s`,
        });
      }
    } catch (err: any) {
      console.warn(`[Pipeline] Background refresh error for ${objectId}:`, err.message);
    }
  }
}

export const pipeline = new RequestPipeline();
