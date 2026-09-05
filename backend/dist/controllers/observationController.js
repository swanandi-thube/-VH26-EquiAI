"use strict";
/**
 * Time-Series Observation Controller (Phase 5)
 * Handles recording historical observations, querying time-series, and detecting demand changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.observationController = exports.ObservationController = void 0;
const repositories_1 = require("../repositories");
const changeDetector_1 = require("../engine/changeDetector");
const scorer_1 = require("../engine/scorer");
const lifecycle_1 = require("../engine/lifecycle");
const redis_1 = require("../cache/redis");
const client_1 = require("../database/client");
class ObservationController {
    /**
     * POST /api/observations/record
     * Record a time-series observation (append-only)
     */
    async recordObservation(req, res) {
        const { objectId, timestamp, requestCount, demand, price, inventory, backendLatencyMs, retrievalCostMs, responseSizeBytes, } = req.body;
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
        const observation = {
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
        await repositories_1.observationRepository.saveObservation(observation);
        // 2. Multi-window pattern analysis & change detection
        const changeResult = await changeDetector_1.changeDetector.analyzeFromRepository(objectId, observation);
        // 3. Dynamic Adaptive Lifecycle Evaluation
        const settings = await repositories_1.settingsRepository.getSettings();
        const pool = client_1.dbClient.getMetrics();
        const cacheKey = `cache:obj:${objectId}`;
        const cachedItem = await redis_1.redisCache.get(cacheKey);
        const factors = scorer_1.scorer.calculateFactors({
            objectId,
            accessCount: observation.requestCount ?? 1,
            retrievalCostMs: observation.retrievalCostMs ?? 50,
            backendLatencyMs: observation.backendLatencyMs ?? 50,
            sizeBytes: observation.responseSizeBytes ?? 1024,
            predictedDemand: changeResult.demandChange,
            confidence: 0.85,
        }, settings, {
            poolUtilization: pool.utilization,
            queueDepth: pool.connectionQueueDepth,
            errorRate: 0,
            avgBackendLatencyMs: observation.backendLatencyMs ?? 50,
        });
        const evalResult = lifecycle_1.lifecycle.evaluate({
            objectId,
            key: cacheKey,
            sizeBytes: observation.responseSizeBytes ?? 1024,
            createdAt: observation.timestamp,
            lastAccessed: observation.timestamp,
            accessCount: observation.requestCount ?? 1,
            recentAccessCount: observation.requestCount ?? 1,
            retrievalCostMs: observation.retrievalCostMs ?? 50,
            backendLatencyMs: observation.backendLatencyMs ?? 50,
            ttlSeconds: changeResult.recommendedTtlSeconds || 300,
            remainingTtlSeconds: cachedItem.hit ? cachedItem.metadata?.remainingTtlSeconds || 300 : 0,
            expiresAt: Date.now() + ((changeResult.recommendedTtlSeconds || 300) * 1000),
            predictedDemand: changeResult.demandChange,
            confidence: 0.85,
            adaptiveScore: factors.finalScore,
            lastDecision: changeResult.recommendedDecision || 'KEEP',
            lastDecisionTime: Date.now(),
        }, factors, settings, cachedItem.hit);
        await repositories_1.decisionRepository.log(evalResult.decisionRecord);
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
    async getObjectObservations(req, res) {
        const objectId = req.params.objectId;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const observations = await repositories_1.observationRepository.getRecentObservations(objectId, limit);
        res.json({
            success: true,
            data: observations,
        });
    }
    /**
     * GET /api/observations
     * Get all recent observations across all objects
     */
    async getAllObservations(req, res) {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const observations = await repositories_1.observationRepository.getAllObservations(limit);
        res.json({
            success: true,
            data: observations,
        });
    }
    /**
     * GET /api/observations/:objectId/changes
     * Run change detection analysis on historical data for an object
     */
    async getObjectChanges(req, res) {
        const objectId = req.params.objectId;
        const analysis = await changeDetector_1.changeDetector.analyzeFromRepository(objectId);
        res.json({
            success: true,
            data: analysis,
        });
    }
}
exports.ObservationController = ObservationController;
exports.observationController = new ObservationController();
