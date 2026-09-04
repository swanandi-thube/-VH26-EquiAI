"use strict";
/**
 * Cache Lifecycle & Decision Engine
 * Determines dynamic TTL and generates KEEP / REFRESH / EVICT / PRE-CACHE decisions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lifecycle = exports.LifecycleEngine = void 0;
const uuid_1 = require("uuid");
class LifecycleEngine {
    /**
     * Evaluates an object to produce dynamic TTL and actionable decision
     */
    evaluate(metadata, factors, settings, isCurrentlyCached) {
        const baseTtl = settings.defaultTtlSeconds || 300;
        const minTtl = settings.minTtlSeconds || 30;
        const maxTtl = settings.maxTtlSeconds || 3600;
        // 1. Dynamic TTL Calculation
        // High trend and high retrieval cost extend TTL; high backend pressure or high volatility adapts TTL
        const trendMultiplier = 1 + (factors.trend * 0.7);
        const costMultiplier = 1 + (factors.retrievalCost * 0.5);
        const pressureDiscount = Math.max(0.6, 1 - (factors.backendPressure * 0.3));
        let calculatedTtl = Math.round(baseTtl * trendMultiplier * costMultiplier * pressureDiscount);
        calculatedTtl = Math.max(minTtl, Math.min(maxTtl, calculatedTtl));
        // 2. Decision Tree Evaluation
        let decision = 'KEEP';
        let reason = '';
        const remainingTtl = metadata.remainingTtlSeconds ?? calculatedTtl;
        const ttlRatio = metadata.ttlSeconds > 0 ? remainingTtl / metadata.ttlSeconds : 1.0;
        if (!isCurrentlyCached) {
            if (factors.predictedDemand > 0.20 && factors.retrievalCost > 0.35) {
                decision = 'PRE-CACHE';
                reason = `High anticipated demand surge (+${Math.round(factors.predictedDemand * 100)}%) with high regeneration cost (${metadata.retrievalCostMs}ms). Proactive cache warming recommended.`;
            }
            else {
                decision = 'KEEP';
                reason = 'Standard cache insertion with application-aware dynamic TTL.';
            }
        }
        else {
            // If remaining TTL is low, but item is frequently accessed and recomputation is expensive -> REFRESH
            if (ttlRatio < 0.25 || remainingTtl < 45) {
                if (factors.finalScore > 0.55 && (factors.frequency > 0.4 || factors.retrievalCost > 0.5)) {
                    decision = 'REFRESH';
                    reason = `Object is approaching expiration (${remainingTtl}s left) with strong demand (score ${factors.finalScore.toFixed(2)}) and expensive DB regeneration (${metadata.retrievalCostMs}ms). Asynchronous refresh triggered.`;
                }
                else if (factors.finalScore < 0.30) {
                    decision = 'EVICT';
                    reason = `Object utility decayed (score ${factors.finalScore.toFixed(2)}) and remaining TTL is low. Demoting to allow valuable items residency.`;
                }
                else {
                    decision = 'KEEP';
                    reason = `Object maintaining active utility (score ${factors.finalScore.toFixed(2)}). TTL recalibrated to ${calculatedTtl}s.`;
                }
            }
            else if (factors.finalScore < 0.20 && factors.memoryCost > 0.5) {
                decision = 'EVICT';
                reason = `Low demand velocity combined with high memory footprint penalty. Candidate for space reclamation.`;
            }
            else if (factors.predictedDemand > 0.30 && factors.retrievalCost > 0.40) {
                decision = 'PRE-CACHE';
                reason = `Demand acceleration detected (+${Math.round(factors.predictedDemand * 100)}%). Extending TTL and scheduling early refresh.`;
            }
            else {
                decision = 'KEEP';
                reason = `Balanced demand and cost profile (score ${factors.finalScore.toFixed(2)}). Resident in cache.`;
            }
        }
        const decisionRecord = {
            id: `DEC-${(0, uuid_1.v4)().substring(0, 8)}`,
            objectId: metadata.objectId,
            decisionType: decision,
            adaptiveScore: factors.finalScore,
            factors,
            previousTtl: metadata.ttlSeconds || baseTtl,
            newTtl: calculatedTtl,
            predictedDemand: factors.predictedDemand,
            confidence: factors.confidence,
            reason,
            timestamp: Date.now(),
        };
        return {
            decision,
            newTtlSeconds: calculatedTtl,
            reason,
            decisionRecord,
        };
    }
}
exports.LifecycleEngine = LifecycleEngine;
exports.lifecycle = new LifecycleEngine();
