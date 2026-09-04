/**
 * Workload & Traffic Generator
 * Generates realistic Zipfian/Pareto distributed request streams with dynamic scenario states
 */

import { WORKLOAD_TYPES, TRAFFIC_SCENARIOS, DEFAULT_CONFIG } from '../core/types.js';
import { ItemCatalog } from './item-catalog.js';

export class WorkloadGenerator {
  constructor(itemCatalog = new ItemCatalog()) {
    this.catalog = itemCatalog;
    this.workloadType = WORKLOAD_TYPES.READ_HEAVY_API;
    this.scenario = TRAFFIC_SCENARIOS.STEADY;
    this.baseRps = DEFAULT_CONFIG.baseRps;
    this.speedMultiplier = 1;

    // Internal simulation time tracking
    this.simTimeSeconds = 0;
    this.spikeTargetItemId = 'prod_048';
    this.shiftPhase = 0;
    this.pollutionRate = 0; // 0 (none) to 1.0 (heavy flood)

    // Precomputed Zipfian weights
    this.zipfWeights = new Map();
    this.recomputeWeights();
  }

  setWorkloadType(type) {
    if (this.workloadType !== type) {
      this.workloadType = type;
      this.spikeTargetItemId = (type === WORKLOAD_TYPES.COMPUTE_HEAVY_REC) ? 'rec_model_012' : 'prod_048';
      this.recomputeWeights();
    }
  }

  setScenario(scenario, options = {}) {
    this.scenario = scenario;
    if (options.targetItemId) this.spikeTargetItemId = options.targetItemId;
    if (scenario === TRAFFIC_SCENARIOS.CACHE_POLLUTION) {
      this.pollutionRate = options.pollutionRate || 0.85;
    } else {
      this.pollutionRate = 0;
    }
    this.recomputeWeights();
  }

  setBaseRps(rps) {
    this.baseRps = Math.max(10, Math.min(5000, Number(rps)));
  }

  setSpeedMultiplier(multiplier) {
    this.speedMultiplier = Number(multiplier) || 1;
  }

  recomputeWeights() {
    const items = this.catalog.getCatalog(this.workloadType);
    const n = items.length;
    let s = (this.workloadType === WORKLOAD_TYPES.READ_HEAVY_API) ? 1.25 : 0.85; // Skew factor
    
    this.zipfWeights.clear();
    let sum = 0;

    for (let rank = 1; rank <= n; rank++) {
      const item = items[rank - 1];
      let weight = 1 / Math.pow(rank, s);

      // Scenario adjustments
      if (this.scenario === TRAFFIC_SCENARIOS.POPULARITY_SPIKE && item.id === this.spikeTargetItemId) {
        weight *= 45.0; // 45x spike
      } else if (this.scenario === TRAFFIC_SCENARIOS.GRADUAL_SHIFT) {
        // Shift hot window based on shiftPhase (0 -> n)
        const shiftedRank = ((rank - 1 + this.shiftPhase) % n) + 1;
        weight = 1 / Math.pow(shiftedRank, s);
      }

      this.zipfWeights.set(item.id, weight);
      sum += weight;
    }

    // Normalize probabilities
    for (const [id, weight] of this.zipfWeights.entries()) {
      this.zipfWeights.set(id, weight / sum);
    }
  }

  tick(deltaMs) {
    this.simTimeSeconds += (deltaMs / 1000) * this.speedMultiplier;

    // Handle Gradual Shift progress
    if (this.scenario === TRAFFIC_SCENARIOS.GRADUAL_SHIFT) {
      const items = this.catalog.getCatalog(this.workloadType);
      this.shiftPhase = Math.floor(this.simTimeSeconds / 15) % items.length;
      this.recomputeWeights();
    }

    // Effective RPS calculation based on scenario
    let effectiveRps = this.baseRps;
    if (this.scenario === TRAFFIC_SCENARIOS.TRAFFIC_BURST) {
      // 4x Burst
      effectiveRps *= 3.8;
    } else if (this.scenario === TRAFFIC_SCENARIOS.COLD_START) {
      effectiveRps *= 1.2;
    }

    const requestCount = Math.max(1, Math.round((effectiveRps * (deltaMs / 1000)) * this.speedMultiplier));
    const requests = [];

    // Generate specific item requests based on distribution
    for (let i = 0; i < requestCount; i++) {
      // Check if pollution key should be injected
      if (this.scenario === TRAFFIC_SCENARIOS.CACHE_POLLUTION && Math.random() < this.pollutionRate) {
        const uniqueKeyId = `crawler_scan_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
        requests.push({
          id: uniqueKeyId,
          name: `Uncached Ephemeral Key (${uniqueKeyId.slice(-6)})`,
          category: 'EPHEMERAL_BOT',
          type: 'UncachedProbe',
          sizeBytes: 8 * 1024 + Math.floor(Math.random() * 64 * 1024),
          baseDbLatencyMs: 35 + Math.floor(Math.random() * 50),
          recomputeCostUnits: 1.0,
          updateVolatility: 1.0,
          isPollutionKey: true,
          timestamp: this.simTimeSeconds
        });
        continue;
      }

      // Sample from Zipfian catalog
      const item = this.sampleItem();
      if (item) {
        requests.push({
          ...item,
          timestamp: this.simTimeSeconds
        });
      }
    }

    return {
      simTimeSeconds: this.simTimeSeconds,
      workloadType: this.workloadType,
      scenario: this.scenario,
      effectiveRps,
      requestCount,
      requests
    };
  }

  sampleItem() {
    const r = Math.random();
    let cumulative = 0;
    const items = this.catalog.getCatalog(this.workloadType);

    for (const item of items) {
      const prob = this.zipfWeights.get(item.id) || 0;
      cumulative += prob;
      if (r <= cumulative) {
        return item;
      }
    }
    return items[items.length - 1];
  }
}
