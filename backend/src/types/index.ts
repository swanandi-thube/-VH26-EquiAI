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
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'CACHE-HIT'
  | 'CACHE-MISS'
  | 'KEEP'
  | 'REFRESH'
  | 'EVICT'
  | 'PRE_CACHE'
  | 'PRE-CACHE'
  | 'BACKEND_FAILURE'
  | 'BACKEND-ERROR'
  | 'CIRCUIT_OPEN'
  | 'CIRCUIT_HALF_OPEN'
  | 'CIRCUIT_CLOSED'
  | 'CIRCUIT-BREAKER'
  | 'RATE-LIMIT'
  | 'WORKLOAD_STARTED'
  | 'WORKLOAD_COMPLETED'
  | 'SCALE';

export interface CacheObjectMetadata {
  objectId: string;
  key: string;
  sizeBytes: number;
  createdAt: number;
  updatedAt?: number;
  lastAccessed: number;
  accessCount: number;
  frequency?: number;
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
  currentState?: string;
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

export type DemandTrendType =
  | 'DEMAND_SPIKE'
  | 'DEMAND_DECLINE'
  | 'STABLE_DEMAND'
  | 'INCREASING_TREND'
  | 'DECREASING_TREND';

export interface ObjectObservationRecord {
  id?: string;
  objectId: string;
  productName?: string;
  category?: string;
  location?: string;
  price?: number | null;
  previousPrice?: number | null;
  priceChangePct?: number | null;
  timestamp: number;
  source?: string;
  sourceReference?: string;
  dataStatus?: string;
  createdAt?: number;
  requestCount?: number;
  demand?: number;
  inventory?: number | null;
  backendLatencyMs?: number;
  retrievalCostMs?: number;
  responseSizeBytes?: number;
}

export interface ChangeDetectionResult {
  objectId: string;
  timestamp: number;
  currentDemand: number;
  previousDemand: number;
  demandChange: number;       // ΔD: percentage change
  frequencyChange: number;    // ΔF: percentage change
  priceChange: number;        // ΔP: percentage change (contextual only)
  latencyChange: number;      // ΔL: percentage change
  detectedPattern: DemandTrendType;
  trendVelocity: number;      // acceleration slope
  sampleWindows: number;
  historySummary: number[];   // e.g. [100, 150, 900]
  recommendedDecision?: DecisionType;
  recommendedTtlSeconds?: number;
}

export interface DecisionExplanation {
  id?: string;
  objectId: string;
  decision: DecisionType;
  decisionType?: DecisionType;
  score: number;
  adaptiveScore?: number;
  reason: string;
  factors?: ScoreFactors;
  newTtl?: number;
  previousTtl?: number;
  createdAt: number;
  timestamp?: number;
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
  createdAt?: number;
  source?: string;
  mode?: 'live' | 'demo' | 'historical';
}

export interface RequestLog {
  requestId: string;
  timestamp: number;
  objectId: string;
  operation: 'GET' | 'SET' | 'INVALIDATE';
  responseSizeBytes: number;
  cacheHit: boolean;
  backendCalled: boolean;
  backendLatencyMs: number;
  cacheLatencyMs: number;
  totalLatencyMs: number;
  statusCode: number;
  errorMessage?: string;
  wasCoalesced?: boolean;
  strategyUsed?: CacheStrategy;
  source?: string;
  mode?: 'live' | 'demo' | 'historical';
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
  source?: string;
  mode?: 'live' | 'demo';
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

export interface WorkloadRequestRecord {
  requestId: string;
  timestamp: number;
  objectId: string;
  operation: 'GET' | 'SET' | 'INVALIDATE' | 'PUT' | 'DELETE' | string;
  responseSizeBytes: number;
  backendLatencyMs: number;
  regenerationCostMs: number;
  statusCode: number;
  ttl?: number | null;
  contentType?: string | null;
  priority?: number | null;
  region?: string | null;
}

export interface WorkloadValidationError {
  row: number;
  error: string;
  raw?: any;
}

export interface WorkloadUploadSummary {
  workloadId: string;
  workload_id?: string;
  filename: string;
  fileType: 'CSV' | 'JSON' | string;
  file_type?: 'CSV' | 'JSON' | string;
  fileSizeBytes: number;
  file_size_bytes?: number;
  totalRows: number;
  total_rows?: number;
  validRows: number;
  valid_rows?: number;
  rejectedRows: number;
  rejected_rows?: number;
  uniqueObjects: number;
  unique_objects?: number;
  timeRange: {
    start: number;
    end: number;
    durationSeconds: number;
  };
  time_range?: {
    start: number;
    end: number;
    durationSeconds: number;
  };
  status: 'VALIDATED' | 'READY' | 'FAILED' | string;
  validationErrors: WorkloadValidationError[];
  validation_errors?: WorkloadValidationError[];
  uploadedAt: number;
  uploaded_at?: number;
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
  ttlSeconds?: number;       // dynamic TTL simulation
  requestRateRps?: number;   // custom RPS
  demandMultiplier?: number; // demand surge
  algorithm?: CacheStrategy; // ADAPTIVE | LRU | LFU | GDS
  workloadId?: string;       // trace reference
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

export interface CostBreakdown {
  disclaimer: string;
  baselineCostPerHour: number;
  adaptiveCostPerHour: number;
  netSavingsPerHour: number;
  netSavingsMonthly: number;
  savingsPercentage: number;
  roiPercentage: number;
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

export interface ReplayConfig {
  workloadId: string;
  requestsPerSecond?: number;
  concurrency?: number;
  cacheCapacityMb?: number;
  ttlSeconds?: number;
  burstTraffic?: boolean;
  speedMultiplier?: number;
}

export interface ReplayMetrics {
  replayId: string;
  workloadId: string;
  filename: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'STOPPED' | 'FAILED';
  totalRequestsInTrace: number;
  requestsCompleted: number;
  cacheHits: number;
  cacheMisses: number;
  backendCalls: number;
  evictionsCount: number;
  errorsCount: number;
  hitRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  currentRps: number;
  concurrency: number;
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
}

export interface RequestQueueStats {
  queueDepth: number;
  activeRequests: number;
  waitingRequests: number;
  rejectedRequests: number;
  maxConcurrency: number;
  maxQueueDepth: number;
  averageWaitTimeMs: number;
}

export interface RetryControllerStats {
  totalRetries: number;
  successfulRetries: number;
  exhaustedRetries: number;
  maxRetries: number;
}

export interface ProtectionStats {
  coalescing: {
    incomingRequests: number;
    backendRegenerations: number;
    requestsCollapsed: number;
    activeInFlightKeys: number;
  };
  circuitBreaker: {
    state: CircuitBreakerState;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    rejectedCalls: number;
    errorRate: number;
    lastStateChange: number;
    lastFailureTime: number;
    recoveryTimeMs: number;
    timeUntilHalfOpenMs: number;
  };
  rateLimiter: {
    capacity: number;
    tokensAvailable: number;
    refillRateRps: number;
    totalRequests: number;
    allowedRequests: number;
    throttledRequests: number;
  };
  queue: RequestQueueStats;
  retry: RetryControllerStats;
  pool: {
    activeConnections: number;
    maxPoolSize: number;
    connectionQueueDepth: number;
    utilization: number;
  };
  replicas: Array<{
    id: string;
    name: string;
    role: string;
    region: string;
    status: string;
    replicationLagMs: number;
    activeQueries: number;
    cpuUtilizationPercent: number;
  }>;
}
