/**
 * Domain Types and Interfaces for ADAPTIVECACHE Platform
 */

export type DecisionType = 'KEEP' | 'REFRESH' | 'EVICT' | 'PRE-CACHE';

export type CacheStrategy = 'ADAPTIVE' | 'LRU' | 'LFU' | 'GDS';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

export type WorkloadType =
  | 'STEADY_LOAD'
  | 'TRAFFIC_SPIKE'
  | 'COLD_START'
  | 'POPULARITY_SHIFT'
  | 'BACKEND_DEGRADATION'
  | 'COMPUTE_HEAVY'
  | 'READ_HEAVY'
  | 'WRITE_HEAVY';

export type SystemHealthStatus = 'CONNECTED' | 'DEGRADED' | 'OFFLINE';

export type EventType =
  | 'KEEP'
  | 'REFRESH'
  | 'EVICT'
  | 'PRE-CACHE'
  | 'CACHE-HIT'
  | 'CACHE-MISS'
  | 'CIRCUIT-BREAKER'
  | 'RATE-LIMIT'
  | 'BACKEND-ERROR'
  | 'SCALE';

export interface CacheObjectMetadata {
  objectId: string;
  key: string;
  sizeBytes: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  recentAccessCount: number;
  retrievalCostMs: number;
  backendLatencyMs: number;
  ttlSeconds: number;
  remainingTtlSeconds: number;
  expiresAt: number;
  predictedDemand: number; // percentage change e.g. 0.35 = +35%
  confidence: number;      // 0.0 to 1.0
  adaptiveScore: number;   // 0.0 to 1.0
  lastDecision: DecisionType;
  lastDecisionTime: number;
  payloadPreview?: string;
  isPreCached?: boolean;
}

export interface ScoreFactors {
  frequency: number;       // F: normalized EWMA access frequency [0, 1]
  recency: number;         // R: exponential time-decay recency [0, 1]
  trend: number;           // T: velocity of request rate change [0, 1]
  retrievalCost: number;   // C: normalized DB query + compute regeneration cost [0, 1]
  backendPressure: number; // P: backend load/queue/error pressure [0, 1]
  memoryCost: number;      // M: size relative to capacity budget [0, 1]
  predictedDemand: number; // Δ% expected demand
  confidence: number;      // 0.0 - 1.0
  finalScore: number;      // Weighted combined score [0, 1]
}

export interface DecisionRecord {
  id: string;
  objectId: string;
  decisionType: DecisionType;
  adaptiveScore: number;
  factors: ScoreFactors;
  previousTtl: number;
  newTtl: number;
  predictedDemand: number;
  confidence: number;
  reason: string;
  timestamp: number;
}

export interface RequestLog {
  requestId: string;
  timestamp: number;
  objectId: string;
  operation: 'GET' | 'SET' | 'INVALIDATE';
  responseSizeBytes: number;
  cacheHit: boolean;
  backendLatencyMs: number;
  totalLatencyMs: number;
  statusCode: number;
  errorMessage?: string;
  wasCoalesced?: boolean;
  strategyUsed?: CacheStrategy;
}

export interface SystemSettings {
  cacheCapacityBytes: number;       // default 50 MB
  defaultTtlSeconds: number;        // default 300s
  minTtlSeconds: number;            // default 30s
  maxTtlSeconds: number;            // default 3600s
  predictionWindowSeconds: number;  // default 60s
  rateLimitRps: number;             // default 200 RPS
  circuitBreakerFailureThreshold: number; // default 50%
  circuitBreakerRecoveryTimeMs: number;   // default 5000ms
  // Configurable Adaptive Weights
  weights: {
    demand: number;
    frequency: number;
    recency: number;
    trend: number;
    retrievalCost: number;
    backendPressure: number;
    memoryCostPenalty: number;
  };
  // Cost assumptions ($)
  costAssumptions: {
    backendRequestCostUsd: number;  // e.g. 0.00005 per backend query
    computeCostPerHourUsd: number;  // e.g. 0.20 per instance hour
    memoryCostPerGbHourUsd: number; // e.g. 0.015 per GB hour
    databaseIoCostUsd: number;      // e.g. 0.00002 per DB query
    networkEgressCostPerGbUsd: number; // e.g. 0.08 per GB
  };
}

export interface TelemetrySnapshot {
  timestamp: number;
  totalRequests: number;
  requestsPerSecond: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;        // 0.0 - 1.0
  backendRequests: number;
  backendLoadRatio: number;    // backend_requests / total_requests
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  cachedObjectsCount: number;
  memoryUsedBytes: number;
  memoryCapacityBytes: number;
  memoryUtilizationRatio: number;
  evictionsCount: number;
  refreshesCount: number;
  preCacheCount: number;
  queueDepth: number;
  activeDbConnections: number;
  circuitBreakerState: CircuitBreakerState;
  collapsedRequestsCount: number;
  errorRate: number;
  estimatedCostPerHourUsd: number;
  baselineCostPerHourUsd: number;
  netSavingsPerHourUsd: number;
}

export interface ActivityEvent {
  id: string;
  timestamp: number;
  eventType: EventType;
  objectId?: string;
  score?: number;
  reason: string;
  metadata?: Record<string, any>;
}

export interface WorkloadConfig {
  type: WorkloadType;
  requestsPerSecond: number;
  durationSeconds: number;
  objectCount: number;
  trafficMultiplier: number;
  backendLatencyMs: number;
  backendErrorRate: number;
  cacheCapacityMb: number;
  hotspotRatio?: number; // e.g. 0.2 means 20% of keys get 80% of traffic (Zipfian)
}

export interface WorkloadRun {
  id: string;
  config: WorkloadConfig;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'FAILED';
  startedAt: number;
  completedAt?: number;
  totalRequestsGenerated: number;
  requestsCompleted: number;
  averageHitRate: number;
  averageLatencyMs: number;
  traceId: string;
}

export interface BenchmarkResultItem {
  strategy: CacheStrategy;
  strategyName: string;
  hitRate: number;
  missRate: number;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  backendRequests: number;
  evictionsCount: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  memoryUsedBytes: number;
  peakMemoryBytes: number;
  totalRegenerationCostMs: number;
  totalCostUsd: number;
  costSavingsPercent: number;
}

export interface BenchmarkRun {
  id: string;
  traceId: string;
  traceName: string;
  totalRequestsInTrace: number;
  cacheCapacityBytes: number;
  isTraceVerifiedFair: boolean;
  fairnessDetails: {
    identicalRequests: boolean;
    identicalOrder: boolean;
    identicalSizes: boolean;
    identicalCapacity: boolean;
    initialStateClean: boolean;
  };
  results: BenchmarkResultItem[];
  startedAt: number;
  completedAt: number;
}

export interface WhatIfScenarioInput {
  trafficMultiplier: number; // 1x to 5x
  cacheCapacityMb: number;   // 50MB to 2048MB
  backendLatencyMs: number;  // 10ms to 500ms
  backendErrorRate: number;  // 0% to 50%
}

export interface WhatIfComparison {
  current: {
    hitRate: number;
    avgLatencyMs: number;
    backendLoadRatio: number;
    costPerHourUsd: number;
    memoryUsedMb: number;
  };
  projected: {
    hitRate: number;
    avgLatencyMs: number;
    backendLoadRatio: number;
    costPerHourUsd: number;
    memoryUsedMb: number;
  };
  difference: {
    hitRateDelta: number;
    latencyDeltaMs: number;
    backendLoadDelta: number;
    costDeltaUsd: number;
    memoryDeltaMb: number;
  };
}

export interface SystemHealthReport {
  overall: SystemHealthStatus;
  timestamp: number;
  components: {
    redis: { status: SystemHealthStatus; latencyMs: number; message: string; details?: any };
    postgres: { status: SystemHealthStatus; latencyMs: number; message: string; details?: any };
    backendApi: { status: SystemHealthStatus; latencyMs: number; message: string; details?: any };
    decisionEngine: { status: SystemHealthStatus; latencyMs: number; message: string; details?: any };
    telemetry: { status: SystemHealthStatus; latencyMs: number; message: string; details?: any };
    webSocket: { status: SystemHealthStatus; activeClients: number; message: string };
  };
}
