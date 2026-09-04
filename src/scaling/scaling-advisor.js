/**
 * Adaptive Scaling Advisor
 * Evaluates cost-benefit ROI for cache capacity scaling decisions.
 */

import { DEFAULT_CONFIG } from '../core/types.js';

export class ScalingAdvisor {
  constructor(pricing = DEFAULT_CONFIG.pricing) {
    this.pricing = pricing;
  }

  evaluateScaling(currentCapacityBytes, currentTelemetry, targetCapacityBytes = null) {
    const currentGB = currentCapacityBytes / (1024 * 1024 * 1024);
    const proposedGB = targetCapacityBytes 
      ? targetCapacityBytes / (1024 * 1024 * 1024) 
      : currentGB * 2; // Default double capacity

    const deltaGB = proposedGB - currentGB;
    
    // Additional Memory Cost ($/hr)
    const additionalCacheCostPerHour = deltaGB * this.pricing.cacheMemoryPerHourPerGB;

    // Traffic volume and current hit rate
    const rps = currentTelemetry.hitsPerSecond + currentTelemetry.missesPerSecond;
    const currentHitRate = currentTelemetry.hitRate;
    const currentMissRate = 1 - currentHitRate;

    // Estimated miss reduction based on Zipfian marginal return
    // Diminishing returns curve: DeltaHitRate = currentMissRate * (deltaGB / (currentGB + deltaGB * 1.5)) * 0.45
    const expectedHitRateGain = Math.min(
      currentMissRate * 0.70,
      Math.max(0.01, currentMissRate * (deltaGB / (currentGB + deltaGB * 1.2)) * 0.50)
    );

    const avoidedHourlyMisses = (rps * 3600) * expectedHitRateGain;
    
    // Avoided DB & Compute costs
    const dbCostSavedPerHour = (avoidedHourlyMisses / 10000) * this.pricing.databaseQueryCostPer10k;
    const computeSavedPerHour = (avoidedHourlyMisses / (rps * 3600 || 1)) * (currentTelemetry.backendLoadPercent / 100) * 16 * this.pricing.backendComputePerHourPerCore * 0.35;
    
    const expectedBackendSavingPerHour = dbCostSavedPerHour + computeSavedPerHour;
    const netBenefitPerHour = expectedBackendSavingPerHour - additionalCacheCostPerHour;

    const shouldScale = netBenefitPerHour > 0.01 && currentTelemetry.memoryUsagePercent > 70;

    let decisionReason = "";
    if (shouldScale) {
      decisionReason = `Positive ROI: Scaling from ${currentGB}GB to ${proposedGB}GB yields +$${netBenefitPerHour.toFixed(3)}/hr net savings by reducing DB/compute load by ~${Math.round(expectedHitRateGain * 100)}%.`;
    } else {
      if (currentTelemetry.memoryUsagePercent <= 70) {
        decisionReason = `Cache utilization is only ${Math.round(currentTelemetry.memoryUsagePercent)}%. Sufficient capacity exists; additional cost ($${additionalCacheCostPerHour.toFixed(3)}/hr) not justified.`;
      } else {
        decisionReason = `Negative ROI: Marginal DB savings ($${expectedBackendSavingPerHour.toFixed(3)}/hr) do not offset added memory cost ($${additionalCacheCostPerHour.toFixed(3)}/hr). Net: -$${Math.abs(netBenefitPerHour).toFixed(3)}/hr.`;
      }
    }

    return {
      currentGB,
      proposedGB,
      deltaGB,
      additionalCacheCostPerHour: Number(additionalCacheCostPerHour.toFixed(3)),
      expectedBackendSavingPerHour: Number(expectedBackendSavingPerHour.toFixed(3)),
      netBenefitPerHour: Number(netBenefitPerHour.toFixed(3)),
      expectedHitRateGainPercent: Number((expectedHitRateGain * 100).toFixed(1)),
      shouldScale,
      decision: shouldScale ? 'SCALE UP' : "DON'T SCALE",
      decisionReason
    };
  }
}
