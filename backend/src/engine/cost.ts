/**
 * Transparent Cost & ROI Calculation Engine
 * Computes deterministic infrastructure costs, backend load reduction, and net savings.
 */

import { SystemSettings, TelemetrySnapshot } from '../types';

export interface CostBreakdown {
  disclaimer: string;
  baselineCostPerHour: number;
  adaptiveCostPerHour: number;
  netSavingsPerHour: number;
  netSavingsMonthly: number;
  savingsPercentage: number;
  backendLoadReductionPercent: number;
  components: {
    memoryCostPerHour: number;
    backendComputeCostPerHour: number;
    databaseIoCostPerHour: number;
    backendRequestCostPerHour: number;
    egressCostPerHour: number;
  };
  assumptions: SystemSettings['costAssumptions'];
}

export class CostEngine {
  public calculateCost(
    telemetry: {
      totalRequestsPerHour: number;
      backendRequestsPerHour: number;
      cacheHitsPerHour: number;
      memoryUsedBytes: number;
      egressBytesPerHour: number;
    },
    settings: SystemSettings
  ): CostBreakdown {
    const a = settings.costAssumptions;

    const totalReq = Math.max(0, telemetry.totalRequestsPerHour);
    const backendReq = Math.max(0, telemetry.backendRequestsPerHour);
    const memoryGb = telemetry.memoryUsedBytes / (1024 * 1024 * 1024);
    const egressGb = (telemetry.egressBytesPerHour || (totalReq * 8192)) / (1024 * 1024 * 1024);

    // Baseline: assuming zero caching (100% of requests hit backend & database)
    const baselineBackendRequestCost = totalReq * a.backendRequestCostUsd;
    const baselineDatabaseCost = totalReq * a.databaseIoCostUsd;
    // Scaled compute needed without cache
    const baselineInstances = Math.max(1, Math.ceil(totalReq / 50000));
    const baselineComputeCost = baselineInstances * a.computeCostPerHourUsd;
    const baselineCostPerHour = baselineBackendRequestCost + baselineDatabaseCost + baselineComputeCost;

    // AdaptiveCache: only backend misses execute DB queries + recomputations
    const adaptiveBackendRequestCost = backendReq * a.backendRequestCostUsd;
    const adaptiveDatabaseCost = backendReq * a.databaseIoCostUsd;
    const memoryCostPerHour = Math.max(0.001, memoryGb * a.memoryCostPerGbHourUsd);
    // Scaled compute with caching
    const adaptiveInstances = Math.max(1, Math.ceil(backendReq / 50000));
    const adaptiveComputeCost = adaptiveInstances * a.computeCostPerHourUsd;
    const egressCostPerHour = egressGb * a.networkEgressCostPerGbUsd;

    const adaptiveCostPerHour =
      adaptiveBackendRequestCost +
      adaptiveDatabaseCost +
      memoryCostPerHour +
      adaptiveComputeCost +
      egressCostPerHour;

    const netSavingsPerHour = Math.max(0, baselineCostPerHour - adaptiveCostPerHour);
    const netSavingsMonthly = netSavingsPerHour * 730; // 730 hours/month average
    const savingsPercentage = baselineCostPerHour > 0 ? (netSavingsPerHour / baselineCostPerHour) * 100 : 0;
    const loadReduction = totalReq > 0 ? ((totalReq - backendReq) / totalReq) * 100 : 0;

    return {
      disclaimer: 'Estimated cost based on measured workload and configured infrastructure assumptions.',
      baselineCostPerHour: Math.round(baselineCostPerHour * 1000) / 1000,
      adaptiveCostPerHour: Math.round(adaptiveCostPerHour * 1000) / 1000,
      netSavingsPerHour: Math.round(netSavingsPerHour * 1000) / 1000,
      netSavingsMonthly: Math.round(netSavingsMonthly * 100) / 100,
      savingsPercentage: Math.round(savingsPercentage * 10) / 10,
      backendLoadReductionPercent: Math.round(loadReduction * 10) / 10,
      components: {
        memoryCostPerHour: Math.round(memoryCostPerHour * 1000) / 1000,
        backendComputeCostPerHour: Math.round(adaptiveComputeCost * 1000) / 1000,
        databaseIoCostPerHour: Math.round(adaptiveDatabaseCost * 1000) / 1000,
        backendRequestCostPerHour: Math.round(adaptiveBackendRequestCost * 1000) / 1000,
        egressCostPerHour: Math.round(egressCostPerHour * 1000) / 1000,
      },
      assumptions: a,
    };
  }
}

export const costEngine = new CostEngine();
