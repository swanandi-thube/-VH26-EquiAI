"use strict";
/**
 * What-If Scenario Analysis Engine
 * Deterministically evaluates counterfactual parameter projections
 * against real traffic distributions, dynamic TTL curves, algorithms, and cache capacity models.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatIfEngine = exports.WhatIfEngine = void 0;
const cost_1 = require("./cost");
class WhatIfEngine {
    evaluate(scenario, currentTelemetry, settings) {
        // Current observed state
        const currentHitRate = currentTelemetry.cacheHitRate || 0.75;
        const currentAvgLatency = currentTelemetry.averageLatencyMs || 28;
        const currentBackendLoad = currentTelemetry.backendLoadRatio || (1 - currentHitRate);
        const currentCost = currentTelemetry.estimatedCostPerHourUsd || 1.45;
        const currentMemMb = Math.round((currentTelemetry.memoryUsedBytes || 32000000) / (1024 * 1024));
        // 1. Capacity impact on Hit Rate: Diminishing returns curve based on Zipfian cache size law
        const baseCapacityMb = settings.cacheCapacityBytes / (1024 * 1024);
        const capacityRatio = scenario.cacheCapacityMb / Math.max(1, baseCapacityMb);
        const missRateBase = Math.max(0.05, 1 - currentHitRate);
        let projectedMissRate = Math.max(0.02, Math.min(0.95, missRateBase * Math.pow(capacityRatio, -0.22)));
        // 2. Dynamic TTL Adjustment Factor
        if (scenario.ttlSeconds && scenario.ttlSeconds > 0) {
            const baseTtl = settings.defaultTtlSeconds || 300;
            const ttlRatio = scenario.ttlSeconds / baseTtl;
            // Longer TTL retains objects longer, shorter TTL expels sooner
            projectedMissRate = Math.max(0.02, Math.min(0.95, projectedMissRate * Math.pow(ttlRatio, -0.12)));
        }
        // 3. Algorithm efficiency factor
        let algoMultiplier = 1.0;
        if (scenario.algorithm === 'LRU')
            algoMultiplier = 1.06;
        else if (scenario.algorithm === 'LFU')
            algoMultiplier = 1.08;
        else if (scenario.algorithm === 'GDS')
            algoMultiplier = 1.04;
        else if (scenario.algorithm === 'ADAPTIVE')
            algoMultiplier = 1.0;
        projectedMissRate = Math.min(0.98, projectedMissRate * algoMultiplier);
        let projectedHitRate = 1 - projectedMissRate;
        // Traffic & Demand Surge impact on hit rate (at extreme traffic multipliers, slight degradation if working set churns)
        const trafficMultiplier = scenario.trafficMultiplier || 1.0;
        const demandMultiplier = scenario.demandMultiplier || 1.0;
        const effectiveTrafficMultiplier = trafficMultiplier * demandMultiplier;
        if (effectiveTrafficMultiplier > 2.5) {
            projectedHitRate = Math.max(0.25, projectedHitRate - ((effectiveTrafficMultiplier - 2.5) * 0.02));
        }
        // 4. Projected Backend Latency and Average Total Latency
        const errorRate = Math.min(1.0, Math.max(0, scenario.backendErrorRate || 0));
        // Error conditions incur retry delays / timeout penalties
        const projectedBackendLatency = scenario.backendLatencyMs * (1 + errorRate * 0.5);
        const cacheHitLatency = 1.2; // ms (Redis in-memory lookup)
        const projectedAvgLatency = (projectedHitRate * cacheHitLatency) + ((1 - projectedHitRate) * projectedBackendLatency);
        // 5. Projected Backend Load Ratio
        const projectedBackendLoad = 1 - projectedHitRate;
        // 6. Projected Memory Usage
        const projectedMemMb = Math.min(scenario.cacheCapacityMb, Math.round(currentMemMb * Math.min(2.0, Math.pow(capacityRatio, 0.7))));
        // 7. Projected Cost
        const baseRps = scenario.requestRateRps || currentTelemetry.requestsPerSecond || 50;
        const projectedTotalReqPerHour = baseRps * 3600 * effectiveTrafficMultiplier;
        const projectedBackendReqPerHour = projectedTotalReqPerHour * (1 - projectedHitRate);
        const costProjection = cost_1.costEngine.calculateCost({
            totalRequestsPerHour: projectedTotalReqPerHour,
            backendRequestsPerHour: projectedBackendReqPerHour,
            cacheHitsPerHour: projectedTotalReqPerHour * projectedHitRate,
            memoryUsedBytes: projectedMemMb * 1024 * 1024,
            egressBytesPerHour: projectedTotalReqPerHour * 8192,
        }, settings);
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
exports.WhatIfEngine = WhatIfEngine;
exports.whatIfEngine = new WhatIfEngine();
