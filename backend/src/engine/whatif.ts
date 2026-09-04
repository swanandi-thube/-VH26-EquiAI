/**
 * What-If Scenario Analysis Engine
 * Deterministically evaluates counterfactual parameter projections
 * against real traffic distributions and cache capacity models.
 */

import { WhatIfComparison, WhatIfScenarioInput, SystemSettings, TelemetrySnapshot } from '../types';
import { costEngine } from './cost';

export class WhatIfEngine {
  public evaluate(
    scenario: WhatIfScenarioInput,
    currentTelemetry: TelemetrySnapshot,
    settings: SystemSettings
  ): WhatIfComparison {
    // Current observed state
    const currentHitRate = currentTelemetry.cacheHitRate || 0.75;
    const currentAvgLatency = currentTelemetry.averageLatencyMs || 28;
    const currentBackendLoad = currentTelemetry.backendLoadRatio || (1 - currentHitRate);
    const currentCost = currentTelemetry.estimatedCostPerHourUsd || 1.45;
    const currentMemMb = Math.round((currentTelemetry.memoryUsedBytes || 32000000) / (1024 * 1024));

    // Counterfactual Projections:
    // 1. Capacity impact on Hit Rate: Diminishing returns logarithmic curve based on Zipfian cache size law
    const baseCapacityMb = settings.cacheCapacityBytes / (1024 * 1024);
    const capacityRatio = scenario.cacheCapacityMb / Math.max(1, baseCapacityMb);
    // Hit rate scales with power of capacity ratio: HR_proj = 1 - (1 - HR_curr) * (capacityRatio ^ -0.22)
    const missRateBase = Math.max(0.05, 1 - currentHitRate);
    const projectedMissRate = Math.max(0.02, Math.min(0.95, missRateBase * Math.pow(capacityRatio, -0.22)));
    let projectedHitRate = 1 - projectedMissRate;

    // Traffic spike impact on hit rate (at extreme traffic multipliers, slight degradation if hot sets churn)
    if (scenario.trafficMultiplier > 2.5) {
      projectedHitRate = Math.max(0.3, projectedHitRate - ((scenario.trafficMultiplier - 2.5) * 0.02));
    }

    // 2. Projected Backend Latency and Average Total Latency
    const projectedBackendLatency = scenario.backendLatencyMs;
    const cacheHitLatency = 1.2; // ms (Redis lookup)
    const projectedAvgLatency = (projectedHitRate * cacheHitLatency) + ((1 - projectedHitRate) * projectedBackendLatency);

    // 3. Projected Backend Load Ratio
    const projectedBackendLoad = 1 - projectedHitRate;

    // 4. Projected Memory Usage
    const projectedMemMb = Math.min(scenario.cacheCapacityMb, Math.round(currentMemMb * Math.min(2.0, Math.pow(capacityRatio, 0.7))));

    // 5. Projected Cost
    const projectedTotalReqPerHour = (currentTelemetry.requestsPerSecond || 50) * 3600 * scenario.trafficMultiplier;
    const projectedBackendReqPerHour = projectedTotalReqPerHour * (1 - projectedHitRate);
    const costProjection = costEngine.calculateCost(
      {
        totalRequestsPerHour: projectedTotalReqPerHour,
        backendRequestsPerHour: projectedBackendReqPerHour,
        cacheHitsPerHour: projectedTotalReqPerHour * projectedHitRate,
        memoryUsedBytes: projectedMemMb * 1024 * 1024,
        egressBytesPerHour: projectedTotalReqPerHour * 8192,
      },
      settings
    );

    const projectedCost = costProjection.adaptiveCostPerHour;

    return {
      current: {
        hitRate: Math.round(currentHitRate * 1000) / 1000,
        avgLatencyMs: Math.round(currentAvgLatency * 10) / 10,
        backendLoadRatio: Math.round(currentBackendLoad * 1000) / 1000,
        costPerHourUsd: Math.round(currentCost * 1000) / 1000,
        memoryUsedMb: currentMemMb,
      },
      projected: {
        hitRate: Math.round(projectedHitRate * 1000) / 1000,
        avgLatencyMs: Math.round(projectedAvgLatency * 10) / 10,
        backendLoadRatio: Math.round(projectedBackendLoad * 1000) / 1000,
        costPerHourUsd: Math.round(projectedCost * 1000) / 1000,
        memoryUsedMb: projectedMemMb,
      },
      difference: {
        hitRateDelta: Math.round((projectedHitRate - currentHitRate) * 1000) / 1000,
        latencyDeltaMs: Math.round((projectedAvgLatency - currentAvgLatency) * 10) / 10,
        backendLoadDelta: Math.round((projectedBackendLoad - currentBackendLoad) * 1000) / 1000,
        costDeltaUsd: Math.round((projectedCost - currentCost) * 1000) / 1000,
        memoryDeltaMb: projectedMemMb - currentMemMb,
      },
    };
  }
}

export const whatIfEngine = new WhatIfEngine();
