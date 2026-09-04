/**
 * Real Request Pipeline for ADAPTIVECACHE
 * Ingress -> Rate Limiter -> Redis -> Singleflight Coalescer -> Circuit Breaker -> Database -> Scorer & Dynamic TTL -> Cache SET -> Telemetry
 */

import { v4 as uuidv4 } from 'uuid';
import { redisCache } from '../cache/redis';
import { rateLimiter } from '../protection/rateLimiter';
import { circuitBreaker } from '../protection/circuitBreaker';
import { coalescer } from '../protection/coalescing';
import { poolMonitor } from '../protection/connectionPool';
import { dbClient } from '../database/client';
import { scorer } from '../engine/scorer';
import { lifecycle } from '../engine/lifecycle';
import { predictor } from '../engine/predictor';
import {
  cacheObjectRepository,
  requestLogRepository,
  decisionRepository,
  eventRepository,
  settingsRepository,
} from '../repositories';
import { RequestLog, CacheObjectMetadata } from '../types';

export interface PipelineResult {
  requestId: string;
  objectId: string;
  statusCode: number;
  data: any | null;
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
   * Main pipeline request processor supporting generic objectId
   */
  public async processRequest(
    objectId: string,
    simulatedLatencyMs?: number,
    simulatedErrorRate?: number
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const requestId = `REQ-${uuidv4().substring(0, 8)}`;
    const cacheKey = `cache:obj:${objectId}`;

    // 1. Rate Limiter Token Bucket Check
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
      await requestLogRepository.log(log);
      await eventRepository.log({
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

    // 2. Record Access in Demand Velocity Predictor
    predictor.recordAccess(objectId, startTime);

    // 3. Redis Cache Lookup (Live Cache)
    const cacheResult = await redisCache.get(cacheKey);

    if (cacheResult.hit && cacheResult.value) {
      // --- CACHE HIT ---
      let parsedData: any = null;
      try {
        parsedData = JSON.parse(cacheResult.value);
      } catch {
        parsedData = cacheResult.value;
      }

      const totalLatency = Math.max(1, Date.now() - startTime);

      // Re-evaluate lifecycle for active item (e.g. background REFRESH if TTL is expiring)
      const currentMeta = cacheResult.metadata!;
      const settings = await settingsRepository.getSettings();
      const pool = dbClient.getMetrics();
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

      // If decision is REFRESH, trigger async background refresh before expiration
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
      await requestLogRepository.log(log);

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
      await requestLogRepository.log(log);
      await eventRepository.log({
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

      const entity = await cacheObjectRepository.findById(objectId);

      // Determine realistic query delay
      let delayMs = 0;
      if (simulatedLatencyMs !== undefined && simulatedLatencyMs > 0) {
        delayMs = simulatedLatencyMs;
      } else if (entity) {
        delayMs = entity.baseRetrievalCostMs;
      } else {
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
    circuitBreaker.recordResult(isSuccess);

    const totalLatency = Date.now() - startTime;

    if (!isSuccess || !backendResponse.entity) {
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
      await requestLogRepository.log(log);
      await eventRepository.log({
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
    const entity = backendResponse.entity;
    const settings = await settingsRepository.getSettings();
    const pool = dbClient.getMetrics();
    poolMonitor.updateReplicaLoad(pool.activeConnections, 1.0);

    const candidateMeta: Partial<CacheObjectMetadata> = {
      objectId,
      key: cacheKey,
      sizeBytes: entity.sizeBytes,
      retrievalCostMs: entity.baseRetrievalCostMs,
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
    await decisionRepository.log(evalResult.decisionRecord);

    // 7. Store in Redis Live Cache with dynamic TTL & metadata
    await redisCache.set(
      cacheKey,
      JSON.stringify(entity.payload || entity),
      {
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
      },
      evalResult.newTtlSeconds
    );

    if (evalResult.decision === 'PRE-CACHE') {
      redisCache.incrementPreCache();
      await eventRepository.log({
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
      responseSizeBytes: entity.sizeBytes,
      cacheHit: false,
      backendLatencyMs: backendResponse.latencyMs,
      totalLatencyMs: totalLatency,
      statusCode: 200,
      wasCoalesced,
    };
    await requestLogRepository.log(log);

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
  public async processProductRequest(
    objectId: string,
    simulatedLatencyMs?: number,
    simulatedErrorRate?: number
  ): Promise<PipelineResult> {
    return this.processRequest(objectId, simulatedLatencyMs, simulatedErrorRate);
  }

  /**
   * Asynchronous background refresh for high-value items approaching expiration
   */
  private async triggerBackgroundRefresh(objectId: string, cacheKey: string) {
    try {
      const entity = await cacheObjectRepository.findById(objectId);
      if (entity) {
        const settings = await settingsRepository.getSettings();
        const pool = dbClient.getMetrics();
        const factors = scorer.calculateFactors(
          {
            objectId,
            sizeBytes: entity.sizeBytes,
            retrievalCostMs: entity.baseRetrievalCostMs,
            backendLatencyMs: 50,
            accessCount: 10,
          },
          settings,
          {
            poolUtilization: pool.utilization,
            queueDepth: pool.connectionQueueDepth,
            errorRate: 0,
            avgBackendLatencyMs: 50,
          }
        );
        const evalRes = lifecycle.evaluate({ objectId } as any, factors, settings, true);
        await redisCache.set(
          cacheKey,
          JSON.stringify(entity.payload || entity),
          {
            objectId,
            sizeBytes: entity.sizeBytes,
            retrievalCostMs: entity.baseRetrievalCostMs,
            backendLatencyMs: 50,
            ttlSeconds: evalRes.newTtlSeconds,
            predictedDemand: factors.predictedDemand,
            confidence: factors.confidence,
            adaptiveScore: factors.finalScore,
            lastDecision: 'REFRESH',
          },
          evalRes.newTtlSeconds
        );
        await eventRepository.log({
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
