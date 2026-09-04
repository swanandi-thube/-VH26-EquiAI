"use strict";
/**
 * Multi-Factor Application-Aware Adaptive Scorer
 * Calculates normalized factor scores and final composite adaptive score.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scorer = exports.AdaptiveScorer = void 0;
const predictor_1 = require("./predictor");
class AdaptiveScorer {
    /**
     * Calculates all normalized multi-factor scores for a cached or candidate object
     */
    calculateFactors(metadata, settings, backendMetrics) {
        const now = Date.now();
        const objectId = metadata.objectId || metadata.key || 'unknown';
        // 1. Prediction & Trend
        const pred = predictor_1.predictor.predictDemand(objectId, now);
        const predictedDemand = pred.predictedDemandChange;
        const confidence = pred.confidence;
        // 2. Normalized Frequency Factor [0, 1]
        const accessCount = metadata.accessCount || 1;
        // Logarithmic dampening of frequency so high volume doesn't saturate completely
        const frequency = Math.min(1.0, Math.log10(accessCount + 1) / Math.log10(100));
        // 3. Normalized Recency Factor [0, 1]
        const lastAccessed = metadata.lastAccessed || now;
        const ageSeconds = Math.max(0, (now - lastAccessed) / 1000);
        const lambda = 0.005; // half-life approx 140s
        const recency = Math.exp(-lambda * ageSeconds);
        // 4. Normalized Trend Factor [0, 1]
        // Map predictedDemand [-1.0, +2.0] into [0, 1]
        const trend = Math.max(0, Math.min(1.0, 0.4 + (predictedDemand * 0.4)));
        // 5. Normalized Retrieval Cost Factor [0, 1]
        const costMs = metadata.retrievalCostMs || metadata.backendLatencyMs || 50;
        // Normalize against 500ms max scale
        const retrievalCost = Math.min(1.0, Math.max(0.05, costMs / 450));
        // 6. Normalized Backend Pressure Factor [0, 1]
        const poolPressure = backendMetrics.poolUtilization; // 0 - 1
        const queuePressure = Math.min(1.0, backendMetrics.queueDepth / 10);
        const errorPressure = Math.min(1.0, backendMetrics.errorRate * 2);
        const backendPressure = Math.min(1.0, (poolPressure * 0.4) + (queuePressure * 0.3) + (errorPressure * 0.3));
        // 7. Normalized Memory Cost Penalty Factor [0, 1]
        const sizeBytes = metadata.sizeBytes || 4096;
        const capacityBytes = settings.cacheCapacityBytes || (64 * 1024 * 1024);
        // Relative footprint scale
        const memoryCost = Math.min(1.0, (sizeBytes * 200) / capacityBytes);
        // 8. Weighted Composite Score
        const w = settings.weights;
        const rawScore = (w.demand * trend) +
            (w.frequency * frequency) +
            (w.recency * recency) +
            (w.retrievalCost * retrievalCost) +
            (w.backendPressure * backendPressure) -
            (w.memoryCostPenalty * memoryCost);
        // Sum of positive weights to normalize to [0, 1]
        const totalPositiveWeight = w.demand + w.frequency + w.recency + w.retrievalCost + w.backendPressure;
        const normalizedScore = Math.max(0.01, Math.min(0.99, rawScore / Math.max(0.1, totalPositiveWeight)));
        return {
            frequency: Math.round(frequency * 100) / 100,
            recency: Math.round(recency * 100) / 100,
            trend: Math.round(trend * 100) / 100,
            retrievalCost: Math.round(retrievalCost * 100) / 100,
            backendPressure: Math.round(backendPressure * 100) / 100,
            memoryCost: Math.round(memoryCost * 100) / 100,
            predictedDemand,
            confidence,
            finalScore: Math.round(normalizedScore * 100) / 100,
        };
    }
}
exports.AdaptiveScorer = AdaptiveScorer;
exports.scorer = new AdaptiveScorer();
