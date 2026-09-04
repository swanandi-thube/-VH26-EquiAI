/**
 * Time-Series Observation Controller (Phase 5)
 * Handles recording historical observations, querying time-series, and detecting demand changes.
 */

import { Request, Response } from 'express';
import { observationRepository, settingsRepository, decisionRepository } from '../repositories';
import { changeDetector } from '../engine/changeDetector';
import { scorer } from '../engine/scorer';
import { lifecycle } from '../engine/lifecycle';
import { redisCache } from '../cache/redis';
import { dbClient } from '../database/client';
import { ObjectObservationRecord } from '../types';

export class ObservationController {
  /**
   * POST /api/observations/record
   * Record a time-series observation (append-only)
   */
  public async recordObservation(req: Request, res: Response): Promise<void> {
    const {
      objectId,
      timestamp,
      requestCount,
      demand,
      price,
      inventory,
      backendLatencyMs,
      retrievalCostMs,
      responseSizeBytes,
    } = req.body;

    if (!objectId || typeof objectId !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Field "objectId" is required and must be a string.',
      });
      return;
    }

    if (demand === undefined || typeof demand !== 'number' || isNaN(demand)) {
      res.status(400).json({
        success: false,
        message: 'Field "demand" is required and must be a valid number.',
      });
      return;
    }

    const observation: ObjectObservationRecord = {
      objectId,
      timestamp: timestamp ? Number(timestamp) : Date.now(),
      requestCount: requestCount !== undefined ? Number(requestCount) : 1,
      demand: Number(demand),
      price: price !== undefined && price !== null ? Number(price) : undefined,
      inventory: inventory !== undefined && inventory !== null ? Number(inventory) : undefined,
      backendLatencyMs: backendLatencyMs !== undefined ? Number(backendLatencyMs) : 50,
      retrievalCostMs: retrievalCostMs !== undefined ? Number(retrievalCostMs) : 50,
      responseSizeBytes: responseSizeBytes !== undefined ? Number(responseSizeBytes) : 1024,
    };

    // 1. Append-only persistence
    await observationRepository.saveObservation(observation);

    // 2. Multi-window pattern analysis & change detection
    const changeResult = await changeDetector.analyzeFromRepository(objectId, observation);

    // 3. Dynamic Adaptive Lifecycle Evaluation
    const settings = await settingsRepository.getSettings();
    const pool = dbClient.getMetrics();
    const cacheKey = `cache:obj:${objectId}`;
    const cachedItem = await redisCache.get(cacheKey);

    const factors = scorer.calculateFactors(
      {
        objectId,
        accessCount: observation.requestCount,
        retrievalCostMs: observation.retrievalCostMs,
        backendLatencyMs: observation.backendLatencyMs,
        sizeBytes: observation.responseSizeBytes,
        predictedDemand: changeResult.demandChange,
        confidence: 0.85,
      },
      settings,
      {
        poolUtilization: pool.utilization,
        queueDepth: pool.connectionQueueDepth,
        errorRate: 0,
        avgBackendLatencyMs: observation.backendLatencyMs,
      }
    );

    const evalResult = lifecycle.evaluate(
      {
        objectId,
        key: cacheKey,
        sizeBytes: observation.responseSizeBytes,
        createdAt: observation.timestamp,
        lastAccessed: observation.timestamp,
        accessCount: observation.requestCount,
        recentAccessCount: observation.requestCount,
        retrievalCostMs: observation.retrievalCostMs,
        backendLatencyMs: observation.backendLatencyMs,
        ttlSeconds: changeResult.recommendedTtlSeconds || 300,
        remainingTtlSeconds: cachedItem.hit ? cachedItem.metadata?.remainingTtlSeconds || 300 : 0,
        expiresAt: Date.now() + ((changeResult.recommendedTtlSeconds || 300) * 1000),
        predictedDemand: changeResult.demandChange,
        confidence: 0.85,
        adaptiveScore: factors.finalScore,
        lastDecision: changeResult.recommendedDecision || 'KEEP',
        lastDecisionTime: Date.now(),
      },
      factors,
      settings,
      cachedItem.hit
    );

    await decisionRepository.log(evalResult.decisionRecord);

    res.json({
      success: true,
      data: {
        observation,
        changeAnalysis: changeResult,
        adaptiveDecision: {
          decision: evalResult.decision,
          score: factors.finalScore,
          newTtlSeconds: evalResult.newTtlSeconds,
          reason: evalResult.reason,
          decisionId: evalResult.decisionRecord.id,
        },
      },
    });
  }

  /**
   * GET /api/observations/:objectId
   * Get historical observations for a specific object
   */
  public async getObjectObservations(req: Request, res: Response): Promise<void> {
    const objectId = req.params.objectId;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const observations = await observationRepository.getRecentObservations(objectId, limit);
    res.json({
      success: true,
      data: observations,
    });
  }

  /**
   * GET /api/observations
   * Get all recent observations across all objects
   */
  public async getAllObservations(req: Request, res: Response): Promise<void> {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const observations = await observationRepository.getAllObservations(limit);
    res.json({
      success: true,
      data: observations,
    });
  }

  /**
   * GET /api/observations/:objectId/changes
   * Run change detection analysis on historical data for an object
   */
  public async getObjectChanges(req: Request, res: Response): Promise<void> {
    const objectId = req.params.objectId;
    const analysis = await changeDetector.analyzeFromRepository(objectId);
    res.json({
      success: true,
      data: analysis,
    });
  }
}

export const observationController = new ObservationController();
