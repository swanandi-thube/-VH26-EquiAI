/**
 * Core Types, Enums, and Configuration Constants
 * Adaptive, Application-Aware Cache Management System
 */

export const WORKLOAD_TYPES = {
  READ_HEAVY_API: 'READ_HEAVY_API',
  COMPUTE_HEAVY_REC: 'COMPUTE_HEAVY_REC'
};

export const TRAFFIC_SCENARIOS = {
  STEADY: 'STEADY',
  POPULARITY_SPIKE: 'POPULARITY_SPIKE',
  GRADUAL_SHIFT: 'GRADUAL_SHIFT',
  COLD_START: 'COLD_START',
  TRAFFIC_BURST: 'TRAFFIC_BURST',
  CACHE_POLLUTION: 'CACHE_POLLUTION'
};

export const CACHE_STRATEGIES = {
  SMART: 'SMART',
  LRU: 'LRU',
  LFU: 'LFU',
  GDS: 'GDS'
};

export const DECISION_TYPES = {
  RETAIN: 'RETAIN',
  REFRESH: 'REFRESH',
  EVICT: 'EVICT'
};

export const POLLUTION_RISK = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH'
};

export const DEFAULT_CONFIG = {
  // Cache Hardware Specs (Simulated)
  cacheCapacityBytes: 2 * 1024 * 1024 * 1024, // 2 GB baseline
  minItemSizeBytes: 4 * 1024,                  // 4 KB
  maxItemSizeBytes: 64 * 1024 * 1024,          // 64 MB
  
  // Traffic Generator Defaults
  baseRps: 250,                                // Requests per second
  trafficSpeedMultiplier: 1,                   // 1x, 2x, 5x, 10x
  tickIntervalMs: 250,                         // Simulation tick every 250ms
  
  // Scoring Weights (Read-Heavy API baseline)
  readHeavyWeights: {
    frequency: 0.25,
    recency: 0.20,
    popularity: 0.20,
    retrievalCost: 0.15,
    freshness: 0.15,
    trend: 0.10,
    reuseProbability: 0.10,
    sizePenalty: 0.15
  },

  // Scoring Weights (Compute-Heavy Recommendation baseline)
  computeHeavyWeights: {
    frequency: 0.15,
    recency: 0.10,
    popularity: 0.15,
    retrievalCost: 0.35,     // Heavily weighs expensive recomputation
    freshness: 0.10,
    trend: 0.15,
    reuseProbability: 0.20,
    sizePenalty: 0.20
  },

  // Dynamic TTL Bounds (seconds)
  minTTL: 15,
  maxTTL: 600,
  defaultTTL: 90,

  // Infrastructure Pricing Model (USD)
  pricing: {
    cacheMemoryPerHourPerGB: 0.040,      // $0.040 / GB-hr (e.g. AWS ElastiCache / Redis node)
    backendComputePerHourPerCore: 0.055, // $0.055 / Core-hr (e.g. c6g.large compute cluster)
    databaseQueryCostPer10k: 0.015,      // $0.015 per 10,000 DB read/write queries
    cacheHitRequestCostPer10k: 0.001,    // $0.001 per 10,000 in-memory fast lookups
    missLatencyPenaltyMultiplier: 1.8    // SLA cost multiplier for missed lookups
  },

  // Database Hardware Simulation
  database: {
    maxConnections: 100,
    baseLatencyMs: 45,
    computeCoreCapacity: 16
  }
};

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatMs(ms) {
  return `${Number(ms).toFixed(1)} ms`;
}

