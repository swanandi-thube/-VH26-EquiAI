/**
 * Multi-Factor Scoring Engine
 * Evaluates cached objects using frequency, recency, popularity, cost, freshness, trend, reuse probability, and size penalty.
 */

import { WORKLOAD_TYPES, DEFAULT_CONFIG } from '../core/types.js';

export class SmartScorer {
  constructor(workloadType = WORKLOAD_TYPES.READ_HEAVY_API) {
    this.workloadType = workloadType;
    this.weights = { ...DEFAULT_CONFIG.readHeavyWeights };
    this.updateWeightsForWorkload(workloadType);
    this.autoAdaptWeights = true;
  }

  updateWeightsForWorkload(workloadType) {
    this.workloadType = workloadType;
    if (this.autoAdaptWeights) {
      if (workloadType === WORKLOAD_TYPES.COMPUTE_HEAVY_REC) {
        this.weights = { ...DEFAULT_CONFIG.computeHeavyWeights };
      } else {
        this.weights = { ...DEFAULT_CONFIG.readHeavyWeights };
      }
    }
  }

  setWeights(customWeights) {
    this.weights = { ...this.weights, ...customWeights };
    this.autoAdaptWeights = false;
  }

  setAutoAdapt(enabled) {
    this.autoAdaptWeights = !!enabled;
    if (this.autoAdaptWeights) {
      this.updateWeightsForWorkload(this.workloadType);
    }
  }

  /**
   * Evaluates an object and returns full breakdown calculations
   */
  evaluateObject(entry, context) {
    const { currentTime, cacheCapacityBytes, maxItemSizeBytes, totalWindowRequests = 100 } = context;

    // 1. Frequency Score (Normalized EWMA access rate, 0 to 1)
    const windowHits = entry.recentHits || 1;
    const frequencyScore = Math.min(1.0, Math.log10(windowHits + 1) / Math.log10(50));

    // 2. Recency Score (Exponential time decay, 0 to 1)
    const timeSinceLastAccess = Math.max(0, currentTime - entry.lastAccessedAt);
    const halfLifeSeconds = (this.workloadType === WORKLOAD_TYPES.READ_HEAVY_API) ? 45 : 120;
    const recencyScore = Math.exp(-0.693 * (timeSinceLastAccess / halfLifeSeconds));

    // 3. Popularity Score (Share of window traffic, 0 to 1)
    const popularityScore = Math.min(1.0, (entry.totalHits / Math.max(10, totalWindowRequests)) * 3.5);

    // 4. Retrieval / Recomputation Cost Score (0 to 1)
    const maxLatencyMs = (this.workloadType === WORKLOAD_TYPES.COMPUTE_HEAVY_REC) ? 600 : 200;
    const maxComputeUnits = (this.workloadType === WORKLOAD_TYPES.COMPUTE_HEAVY_REC) ? 40 : 5;
    const latencyNorm = Math.min(1.0, entry.baseDbLatencyMs / maxLatencyMs);
    const computeNorm = Math.min(1.0, (entry.recomputeCostUnits || 1) / maxComputeUnits);
    const retrievalCostScore = 0.5 * latencyNorm + 0.5 * computeNorm;

    // 5. Trend Score (Rate of change in hits, 0 to 1)
    const prevHits = entry.prevWindowHits || 0;
    const hitDelta = windowHits - prevHits;
    let trendScore = 0.5 + Math.min(0.5, Math.max(-0.5, hitDelta / 20));

    // 6. Freshness / Staleness Score (0 to 1)
    const age = Math.max(0, currentTime - entry.createdAt);
    const ttl = entry.currentTTL || DEFAULT_CONFIG.defaultTTL;
    const freshnessRatio = Math.max(0, 1 - (age / ttl));
    // Highly volatile items decay freshness faster
    const volatilityImpact = entry.updateVolatility || 0.1;
    const freshnessScore = Math.max(0, freshnessRatio * (1 - 0.3 * volatilityImpact));

    // 7. Reuse Probability (Bayesian estimate based on hit regularity, 0 to 1)
    const isSingleUse = (entry.totalHits <= 1 && age > 30);
    const reuseProbability = isSingleUse ? 0.08 : Math.min(1.0, (windowHits / (windowHits + 2)) * (1 + 0.2 * recencyScore));

    // 8. Size Penalty (0 to 1)
    const sizeBytes = entry.sizeBytes || 4096;
    const sizeRatio = sizeBytes / Math.max(1, maxItemSizeBytes);
    const sizePenalty = Math.min(1.0, Math.sqrt(sizeRatio));

    // Weighted Score Calculation
    const W = this.weights;
    const rawWeighted = 
      (W.frequency * frequencyScore) +
      (W.recency * recencyScore) +
      (W.popularity * popularityScore) +
      (W.retrievalCost * retrievalCostScore) +
      (W.trend * trendScore) +
      (W.freshness * freshnessScore) +
      (W.reuseProbability * reuseProbability) -
      (W.sizePenalty * sizePenalty);

    // Normalized Final Score [0.00 to 1.00]
    const finalScore = Math.max(0.01, Math.min(1.0, rawWeighted));

    return {
      finalScore: Number(finalScore.toFixed(3)),
      factors: {
        frequency: Number(frequencyScore.toFixed(3)),
        recency: Number(recencyScore.toFixed(3)),
        popularity: Number(popularityScore.toFixed(3)),
        retrievalCost: Number(retrievalCostScore.toFixed(3)),
        trend: Number(trendScore.toFixed(3)),
        freshness: Number(freshnessScore.toFixed(3)),
        reuseProbability: Number(reuseProbability.toFixed(3)),
        sizePenalty: Number(sizePenalty.toFixed(3))
      },
      weights: { ...W },
      age: Math.round(age),
      ttl: Math.round(ttl),
      freshnessRatio: Number(freshnessRatio.toFixed(2)),
      sizeBytes,
      details: {
        timeSinceLastAccess: Math.round(timeSinceLastAccess),
        windowHits,
        totalHits: entry.totalHits
      }
    };
  }
}
