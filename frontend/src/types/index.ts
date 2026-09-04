/**
 * Frontend Domain Types matching Backend API
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
  predictedDemand: number;
  confidence: number;
  adaptiveScore: number;
  lastDecision: DecisionType;
  lastDecisionTime: number;
  payloadPreview?: string;
  isPreCached?: boolean;
}

export interface ScoreFactors {
  frequency: number;
  recency: number;
  trend: number;
  retrievalCost: number;
  backendPressure: number;
  memoryCost: number;
  predictedDemand: number;
  confidence: number;
  finalScore: number;
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
  timestamp: number;
  requestCount: number;
  demand: number;
  price?: number | null;
  inventory?: number | null;
  backendLatencyMs: number;
  retrievalCostMs: number;
  responseSizeBytes: number;
}

export interface ChangeDetectionResult {
  objectId: string;
  timestamp: number;
  currentDemand: number;
  previousDemand: number;
  demandChange: number;
  frequencyChange: number;
  priceChange: number;
  latencyChange: number;
  detectedPattern: DemandTrendType;
  trendVelocity: number;
  sampleWindows: number;
  historySummary: number[];
  recommendedDecision?: DecisionType;
  recommendedTtlSeconds?: number;
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
}

export interface FactorAttribution {
  name: string;
  key: string;
  rawValue: number;
  weight: number;
  contribution: number;
  description: string;
}

export interface DecisionExplanation {
  id: string;
  objectId: string;
  decisionType: string;
  adaptiveScore: number;
  confidence: number;
  predictedDemandPercent: number;
  previousTtlSeconds: number;
  recommendedTtlSeconds: number;
  ttlChangeSeconds: number;
  reason: string;
  timestamp: number;
  attributions: FactorAttribution[];
  summaryMessage: string;
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
}

export interface TelemetrySnapshot {
  timestamp: number;
  totalRequests: number;
  requestsPerSecond: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  backendRequests: number;
  backendLoadRatio: number;
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
  trafficMultiplier: number;
  cacheCapacityMb: number;
  backendLatencyMs: number;
  backendErrorRate: number;
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

export interface SystemSettings {
  cacheCapacityBytes: number;
  defaultTtlSeconds: number;
  minTtlSeconds: number;
  maxTtlSeconds: number;
  predictionWindowSeconds: number;
  rateLimitRps: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerRecoveryTimeMs: number;
  weights: {
    demand: number;
    frequency: number;
    recency: number;
    trend: number;
    retrievalCost: number;
    backendPressure: number;
    memoryCostPenalty: number;
  };
  costAssumptions: {
    backendRequestCostUsd: number;
    computeCostPerHourUsd: number;
    memoryCostPerGbHourUsd: number;
    databaseIoCostUsd: number;
    networkEgressCostPerGbUsd: number;
  };
}

export interface SystemHealthReport {
  overall: SystemHealthStatus;
  timestamp: number;
  components: {
    redis: { status: SystemHealthStatus; latencyMs: number; message: string };
    postgres: { status: SystemHealthStatus; latencyMs: number; message: string };
    backendApi: { status: SystemHealthStatus; latencyMs: number; message: string };
    decisionEngine: { status: SystemHealthStatus; latencyMs: number; message: string };
    telemetry: { status: SystemHealthStatus; latencyMs: number; message: string };
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
    lastFailureTime?: number;
    recoveryTimeMs?: number;
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
  queue?: RequestQueueStats;
  retry?: RetryControllerStats;
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
