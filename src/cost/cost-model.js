/**
 * Simulated Infrastructure Cost Model
 * Calculates transparent, real-time hosting and operational costs based on cache memory, compute, and database loads.
 */

import { DEFAULT_CONFIG } from '../core/types.js';

export class CostModel {
  constructor(pricing = DEFAULT_CONFIG.pricing) {
    this.pricing = pricing;
  }

  /**
   * Computes hourly cost and request-level metrics
   */
  computeCost(telemetry) {
    const {
      cacheCapacityBytes,
      usedBytes,
      hitsPerSecond,
      missesPerSecond,
      backendLoadPercent,
      dbQueriesPerSecond,
      totalRequestsWindow,
      totalHitsWindow,
      totalMissesWindow
    } = telemetry;

    const capacityGB = cacheCapacityBytes / (1024 * 1024 * 1024);
    
    // 1. Cache Memory Cost ($/hr)
    const cacheCostPerHour = capacityGB * this.pricing.cacheMemoryPerHourPerGB;

    // 2. Backend Compute Cost ($/hr)
    // Cores active (up to 16 cores based on backendLoadPercent)
    const activeCores = Math.max(1, (backendLoadPercent / 100) * 16);
    const computeCostPerHour = activeCores * this.pricing.backendComputePerHourPerCore;

    // 3. Database / API Query Cost ($/hr)
    // 3600 seconds in an hour
    const hourlyDbQueries = dbQueriesPerSecond * 3600;
    const dbCostPerHour = (hourlyDbQueries / 10000) * this.pricing.databaseQueryCostPer10k;

    // 4. In-memory lookup operational cost ($/hr)
    const hourlyHits = hitsPerSecond * 3600;
    const hitLookupCostPerHour = (hourlyHits / 10000) * this.pricing.cacheHitRequestCostPer10k;

    // Total Simulated Cost ($/hr)
    const totalCostPerHour = cacheCostPerHour + computeCostPerHour + dbCostPerHour + hitLookupCostPerHour;

    // Baseline "Uncached" or "Cold" hypothetical cost for comparison
    const totalRequestsPerHour = (hitsPerSecond + missesPerSecond) * 3600;
    const uncachedDbCostPerHour = (totalRequestsPerHour / 10000) * this.pricing.databaseQueryCostPer10k;
    const uncachedComputeCostPerHour = 16 * this.pricing.backendComputePerHourPerCore * 0.95; // saturated cores
    const uncachedTotalCostPerHour = uncachedDbCostPerHour + uncachedComputeCostPerHour;

    // Cost Savings ($/hr) and ROI %
    const costSavingsPerHour = Math.max(0, uncachedTotalCostPerHour - totalCostPerHour);
    const savingsPercentage = uncachedTotalCostPerHour > 0 
      ? Math.round((costSavingsPerHour / uncachedTotalCostPerHour) * 100)
      : 0;

    return {
      totalCostPerHour: Number(totalCostPerHour.toFixed(3)),
      cacheCostPerHour: Number(cacheCostPerHour.toFixed(3)),
      computeCostPerHour: Number(computeCostPerHour.toFixed(3)),
      dbCostPerHour: Number(dbCostPerHour.toFixed(3)),
      hitLookupCostPerHour: Number(hitLookupCostPerHour.toFixed(4)),
      
      costSavingsPerHour: Number(costSavingsPerHour.toFixed(3)),
      savingsPercentage,
      uncachedTotalCostPerHour: Number(uncachedTotalCostPerHour.toFixed(3)),

      capacityGB: Number(capacityGB.toFixed(2)),
      activeCores: Number(activeCores.toFixed(1)),
      hourlyDbQueries: Math.round(hourlyDbQueries),
      hourlyHits: Math.round(hourlyHits)
    };
  }
}
