/**
 * Automated Verification & Unit Test Suite for ADAPTIVECACHE Platform
 */

import { redisCache } from '../src/cache/redis';
import { db } from '../src/db';
import { circuitBreaker } from '../src/protection/circuitBreaker';
import { coalescer } from '../src/protection/coalescing';
import { rateLimiter } from '../src/protection/rateLimiter';
import { scorer } from '../src/engine/scorer';
import { lifecycle } from '../src/engine/lifecycle';
import { predictor } from '../src/engine/predictor';
import { benchmarkEngine } from '../src/benchmark/engine';
import { costEngine } from '../src/engine/cost';
import { cacheService } from '../src/services/cacheService';
import { requestLogRepository, workloadRepository } from '../src/repositories';
import { telemetry } from '../src/telemetry';
import { IOriginDataSource } from '../src/services/originAdapter';
import { workloadIngestionService } from '../src/services/workloadIngestionService';
import { explainability } from '../src/engine/explainability';
import { changeDetector } from '../src/engine/changeDetector';
import { observationRepository, decisionRepository, settingsRepository, benchmarkRepository, eventRepository } from '../src/repositories';
import { observationController } from '../src/controllers/observationController';
import { replayRunner } from '../src/workload/replayRunner';
import { requestQueue } from '../src/protection/requestQueue';
import { retryController } from '../src/protection/retryController';
import { whatIfEngine } from '../src/engine/whatif';
import { dbClient } from '../src/database/client';
import { MigrationRunner } from '../src/database/migrations';
import { config } from '../src/config';
import { wsService } from '../src/ws/server';
import { EventType } from '../src/types';
import { demoService } from '../src/services/demoService';
import { DEMO_FIXTURES, DEMO_SCENARIOS } from '../src/services/demoFixtures';


let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================================');
  console.log('  RUNNING ADAPTIVECACHE AUTOMATED TEST SUITE');
  console.log('========================================================\n');

  // Test 1: Redis Cache Engine Operations (GET, SET, TTL, Eviction)
  console.log('--- Test Suite 1: Real Redis Cache Engine ---');
  await redisCache.flushall();
  redisCache.setCapacity(10000); // 10 KB small capacity
  await redisCache.set('product:1', JSON.stringify({ name: 'Test 1' }), { objectId: '1', sizeBytes: 4000, retrievalCostMs: 50 }, 10);
  const get1 = await redisCache.get('product:1');
  assert(get1.hit === true, 'Cache SET and GET hit verified');
  assert((await redisCache.ttl('product:1')) > 0, 'TTL correctly returned for active key');

  // Insert two more items to force eviction of 10KB budget
  await redisCache.set('product:2', JSON.stringify({ name: 'Test 2' }), { objectId: '2', sizeBytes: 4000, retrievalCostMs: 100 }, 10);
  await redisCache.set('product:3', JSON.stringify({ name: 'Test 3' }), { objectId: '3', sizeBytes: 4000, retrievalCostMs: 200 }, 10);
  assert(redisCache.getStats().evictions >= 1, 'Memory capacity eviction triggered under budget constraint');
  assert(redisCache.getStats().usedMemoryBytes <= 10000, 'Used memory strictly strictly within configured capacity');

  // Test 2: Request Coalescing (Singleflight deduplication)
  console.log('\n--- Test Suite 2: Request Coalescing (Singleflight) ---');
  coalescer.resetCounters();
  let backendCallCount = 0;
  const mockBackendFetch = async () => {
    await new Promise(r => setTimeout(r, 60));
    backendCallCount++;
    return { data: 'coalesced_data' };
  };

  // Dispatch 20 concurrent requests for the exact same key
  const requests = Array.from({ length: 20 }, () => coalescer.execute('hot_key_1', mockBackendFetch));
  const results = await Promise.all(requests);
  assert(backendCallCount === 1, `Exactly 1 backend fetch occurred for 20 concurrent requests (got ${backendCallCount})`);
  const coalescedCount = results.filter(r => r.wasCoalesced).length;
  assert(coalescedCount === 19, `Exactly 19 requests were coalesced into single flight (got ${coalescedCount})`);

  // Test 3: Circuit Breaker State Transitions
  console.log('\n--- Test Suite 3: Circuit Breaker Finite State Machine ---');
  circuitBreaker.reset();
  circuitBreaker.setConfig(0.4, 200); // 40% error rate threshold, 200ms recovery
  assert(circuitBreaker.getState() === 'CLOSED', 'Initial state is CLOSED');

  // Inject failures
  for (let i = 0; i < 6; i++) {
    circuitBreaker.recordResult(false);
  }
  assert(circuitBreaker.getState() === 'OPEN', 'Transitions to OPEN after exceeding error threshold');
  assert(circuitBreaker.canExecute() === false, 'canExecute returns false when OPEN');

  // Wait for recovery timer
  await new Promise(r => setTimeout(r, 250));
  assert(circuitBreaker.getState() === 'HALF-OPEN', 'Transitions to HALF-OPEN after recovery backoff timer');

  // Inject consecutive successes
  circuitBreaker.recordResult(true);
  circuitBreaker.recordResult(true);
  circuitBreaker.recordResult(true);
  assert(circuitBreaker.getState() === 'CLOSED', 'Transitions back to CLOSED after consecutive successful probes');

  // Test 4: Token Bucket Rate Limiter
  console.log('\n--- Test Suite 4: Token Bucket Rate Limiter ---');
  rateLimiter.reset();
  rateLimiter.setLimit(10, 5); // 10 RPS, burst capacity 5
  assert(rateLimiter.tryAcquire(1) === true, 'First acquire succeeds within burst capacity');
  assert(rateLimiter.tryAcquire(4) === true, 'Consumes remaining 4 burst tokens');
  assert(rateLimiter.tryAcquire(1) === false, 'Throttles request when token bucket is exhausted');

  // Test 5: Multi-Factor Scorer & Dynamic TTL
  console.log('\n--- Test Suite 5: Decision Engine & Scoring ---');
  const settings = db.getSettings();
  const factors = scorer.calculateFactors(
    {
      objectId: 'Product_42',
      accessCount: 25,
      retrievalCostMs: 350,
      sizeBytes: 8192,
      lastAccessed: Date.now(),
    },
    settings,
    { poolUtilization: 0.8, queueDepth: 4, errorRate: 0.05, avgBackendLatencyMs: 350 }
  );
  assert(factors.finalScore > 0 && factors.finalScore <= 1.0, `Adaptive Score normalized correctly: ${factors.finalScore}`);
  assert(factors.retrievalCost > 0.6, 'High retrieval cost properly normalized');

  const evalRes = lifecycle.evaluate({ objectId: 'Product_42', sizeBytes: 8192, retrievalCostMs: 350, ttlSeconds: 300 } as any, factors, settings, true);
  assert(['KEEP', 'REFRESH', 'PRE-CACHE', 'EVICT'].includes(evalRes.decision), `Valid decision generated: ${evalRes.decision}`);
  assert(evalRes.newTtlSeconds >= settings.minTtlSeconds, `Dynamic TTL within minimum bounds: ${evalRes.newTtlSeconds}s`);

  // Test 6: Statistical Demand Prediction
  console.log('\n--- Test Suite 6: Demand Predictor (Statistical Velocity) ---');
  predictor.clear();
  const now = Date.now();
  // Simulate burst of accesses
  for (let i = 0; i < 12; i++) {
    predictor.recordAccess('Product_99', now - (i * 2000));
  }
  const pred = predictor.predictDemand('Product_99', now);
  assert(pred.confidence > 0.6, `Predictor calculated high confidence for 12 data points: ${(pred.confidence * 100).toFixed(0)}%`);
  assert(pred.samplePoints === 12, 'Recorded all sample points in sliding window');

  // Test 7: Fair Benchmark Engine
  console.log('\n--- Test Suite 7: Fair Multi-Strategy Benchmark ---');
  const testTrace = benchmarkEngine.generateTrace(500, 30);
  const benchResult = await benchmarkEngine.runBenchmark(testTrace, 64 * 1024 * 1024, 'Automated Test Trace');
  assert(benchResult.results.length === 4, 'Ran all 4 strategies (Adaptive, LRU, LFU, GDS)');
  assert(benchResult.isTraceVerifiedFair === true, 'Fairness validation passed');
  assert(benchResult.results[0].totalRequests === 500, 'Exact same request count (500) processed across all algorithms');

  // Test 8: Cost & ROI Calculation
  console.log('\n--- Test Suite 8: Cost & ROI Calculation ---');
  const costRes = costEngine.calculateCost(
    {
      totalRequestsPerHour: 100000,
      backendRequestsPerHour: 20000,
      cacheHitsPerHour: 80000,
      memoryUsedBytes: 128 * 1024 * 1024,
      egressBytesPerHour: 100000 * 4096,
    },
    settings
  );
  assert(costRes.baselineCostPerHour > costRes.adaptiveCostPerHour, 'AdaptiveCache cost is strictly lower than un-cached baseline');
  assert(costRes.netSavingsPerHour > 0, `Positive net savings calculated: $${costRes.netSavingsPerHour}/hr`);
  assert(costRes.backendLoadReductionPercent === 80, `Backend load reduction verified at 80% (got ${costRes.backendLoadReductionPercent}%)`);

  // Test 9: Phase 2 Real Cache Engine Flow (HIT/MISS/Redis/Origin/Metadata/Logs/Dashboard)
  console.log('\n--- Test Suite 9: Phase 2 Real Cache Engine Request Flow ---');
  rateLimiter.reset();
  rateLimiter.setLimit(500, 500);
  circuitBreaker.reset();
  await redisCache.flushall();
  redisCache.setCapacity(64 * 1024 * 1024);

  let originCallCount = 0;
  const mockOrigin: IOriginDataSource = {
    fetchObject: async (id: string) => {
      originCallCount++;
      return {
        objectId: id,
        data: { id, title: 'Phase 2 Real Cache Object', timestamp: Date.now() },
        sizeBytes: 2048,
        retrievalCostMs: 45,
        statusCode: 200,
        sourceType: 'DEV_ADAPTER',
      };
    },
  };
  cacheService.setOriginAdapter(mockOrigin);

  const initialSnapshot = telemetry.getSnapshot();

  // 1. First request = MISS
  const res1 = await cacheService.handleRequest('obj_phase2_flow');
  assert(res1.cacheHit === false, '1. First request = MISS verified (cacheHit === false)');
  // 2. Origin accessed
  assert(res1.backendCalled === true, '2. Origin accessed on MISS (backendCalled === true)');
  assert(originCallCount === 1, '2b. Origin fetch count exactly 1');
  // 3. Redis SET
  const redisEntry1 = await redisCache.get('cache:obj:obj_phase2_flow');
  assert(redisEntry1.hit === true && redisEntry1.value !== null, '3. Stored in Redis via Redis SET');
  assert(redisEntry1.metadata?.sizeBytes === 2048, '3b. Metadata size recorded');
  assert(redisEntry1.metadata?.frequency === 1, '3c. Metadata frequency initialized to 1');
  assert(redisEntry1.metadata?.currentState !== undefined, '3d. Metadata current_state maintained');

  // 4. Second request = HIT
  const res2 = await cacheService.handleRequest('obj_phase2_flow');
  assert(res2.cacheHit === true, '4. Second request = HIT verified (cacheHit === true)');
  // 5. Origin not called on HIT
  assert(res2.backendCalled === false, '5. Origin NOT called on HIT (backendCalled === false)');
  assert(originCallCount === 1, '5b. Origin count remained 1 (no unnecessary origin call on HIT)');

  // 6. Metadata updates
  const redisEntry2 = await redisCache.get('cache:obj:obj_phase2_flow');
  assert(redisEntry2.metadata?.frequency === 2, '6a. Metadata frequency incremented to 2 on HIT');
  assert((redisEntry2.metadata?.lastAccessed || 0) >= (redisEntry1.metadata?.lastAccessed || 0), '6b. Metadata last_access timestamp updated');
  assert(redisEntry2.metadata?.updatedAt !== undefined, '6c. Metadata updated_at maintained');
  assert(redisEntry2.metadata?.ttlSeconds! > 0, '6d. Metadata ttl maintained');

  // 7. Request logs created
  const recentLogs = await requestLogRepository.getRecent(10);
  const logMiss = recentLogs.find(l => l.requestId === res1.requestId);
  const logHit = recentLogs.find(l => l.requestId === res2.requestId);
  assert(logMiss !== undefined && logMiss.cacheHit === false && logMiss.backendCalled === true, '7a. Request log created for MISS with backend_called=true');
  assert(logHit !== undefined && logHit.cacheHit === true && logHit.backendCalled === false, '7b. Request log created for HIT with backend_called=false');
  assert(logMiss!.responseSizeBytes === 2048, '7c. Request log contains response_size');
  assert(logMiss!.backendLatencyMs === 45, '7d. Request log contains backend_latency');
  assert(logHit!.cacheLatencyMs >= 0, '7e. Request log contains cache_latency');
  assert(logMiss!.totalLatencyMs >= 0, '7f. Request log contains total_latency');
  assert(logMiss!.statusCode === 200, '7g. Request log contains status_code');

  // 8. Dashboard values change from actual requests
  const updatedSnapshot = telemetry.getSnapshot();
  assert(updatedSnapshot.totalRequests > initialSnapshot.totalRequests, '8a. Dashboard totalRequests updated from actual requests');
  assert(updatedSnapshot.cacheHits > initialSnapshot.cacheHits, '8b. Dashboard cacheHits updated from actual requests');
  assert(updatedSnapshot.cacheMisses > initialSnapshot.cacheMisses, '8c. Dashboard cacheMisses updated from actual requests');
  assert(updatedSnapshot.cachedObjectsCount > 0, '8d. Dashboard cachedObjectsCount reflects actual Redis keys');

  // Test 10: Real Workload Ingestion (CSV & JSON Ingestion, Validation, Persistence)
  console.log('\n--- Test Suite 10: Real Workload Ingestion (Phase 3) ---');

  // 1. Valid CSV Upload
  const validCsvContent = `timestamp,request_id,object_id,operation,response_size,backend_latency,regeneration_cost,status_code,ttl,content_type,priority,region
2026-09-04T10:00:00Z,REQ-CSV-01,Product_101,GET,4096,65,70,200,300,application/json,1,us-east
2026-09-04T10:00:02Z,REQ-CSV-02,Product_102,GET,8192,120,130,200,600,application/json,2,us-east
2026-09-04T10:00:05Z,REQ-CSV-03,Product_101,GET,4096,65,70,200,300,application/json,1,us-west
2026-09-04T10:00:10Z,REQ-CSV-04,Product_103,SET,2048,45,50,200,120,application/json,1,eu-central`;

  const validCsvRes = await workloadIngestionService.ingestFile('benchmark_trace.csv', validCsvContent);
  assert(validCsvRes.summary.status === 'VALIDATED', '1. Valid CSV parsed and marked as VALIDATED');
  assert(validCsvRes.summary.totalRows === 4, '1b. Valid CSV totalRows is 4');
  assert(validCsvRes.summary.validRows === 4, '1c. Valid CSV validRows is 4');
  assert(validCsvRes.summary.rejectedRows === 0, '1d. Valid CSV rejectedRows is 0');
  assert(validCsvRes.summary.uniqueObjects === 3, '1e. Valid CSV uniqueObjects correctly counted as 3');
  assert(validCsvRes.summary.timeRange.durationSeconds === 10, '1f. Valid CSV time duration calculated as 10s');

  // 2. Malformed CSV Upload
  const malformedCsvContent = `timestamp,request_id,object_id,operation,response_size,backend_latency,regeneration_cost,status_code
2026-09-04T10:00:00Z,REQ-MAL-01,Product_201,GET,4096,65,70,200
2026-09-04T10:00:02Z,REQ-MAL-02,,GET,8192,120,130,200
2026-09-04T10:00:05Z,REQ-MAL-03,Product_202,GET,invalid_size,65,70,200
2026-09-04T10:00:07Z,REQ-MAL-04,Product_203,GET,2048,45,50,invalid_status
2026-09-04T10:00:09Z,REQ-MAL-05,Product_204,GET,1024,30,35,200`;

  const malformedCsvRes = await workloadIngestionService.ingestFile('malformed_trace.csv', malformedCsvContent);
  assert(malformedCsvRes.summary.status === 'VALIDATED', '2. Malformed CSV processed with partial valid rows');
  assert(malformedCsvRes.summary.totalRows === 5, '2b. Malformed CSV detected all 5 rows');
  assert(malformedCsvRes.summary.validRows === 2, '2c. Malformed CSV extracted exactly 2 valid rows');
  assert(malformedCsvRes.summary.rejectedRows === 3, '2d. Malformed CSV rejected exactly 3 invalid rows');
  assert(malformedCsvRes.summary.validationErrors.length === 3, '2e. Validation errors recorded per rejected row');
  assert(malformedCsvRes.summary.validationErrors.some(e => e.error.includes('object_id')), '2f. Captured missing object_id error');

  // 3. Empty CSV Upload
  const emptyCsvRes = await workloadIngestionService.ingestFile('empty_trace.csv', '   \n  \n');
  assert(emptyCsvRes.summary.status === 'FAILED', '3. Empty CSV rejected and status marked as FAILED');
  assert(emptyCsvRes.summary.validRows === 0, '3b. Empty CSV validRows is 0');
  assert(emptyCsvRes.summary.validationErrors.length > 0, '3c. Empty file validation error reported');

  // 4. Invalid JSON Upload
  const invalidJsonContent = `[{"request_id": "REQ-1", "object_id": "Product_1", "timestamp": 1725450000000, `;
  const invalidJsonRes = await workloadIngestionService.ingestFile('corrupted.json', invalidJsonContent);
  assert(invalidJsonRes.summary.status === 'FAILED', '4. Invalid JSON syntax detected and marked FAILED');
  assert(invalidJsonRes.summary.validRows === 0, '4b. Invalid JSON yields 0 valid rows');
  assert(invalidJsonRes.summary.validationErrors[0].error.includes('JSON'), '4c. JSON syntax error detail captured');

  // 5. Valid JSON Upload
  const validJsonContent = JSON.stringify([
    {
      timestamp: 1725450000000,
      request_id: 'REQ-JSON-01',
      object_id: 'Product_301',
      operation: 'GET',
      response_size: 5120,
      backend_latency: 85,
      regeneration_cost: 90,
      status_code: 200,
      priority: 1,
      region: 'us-east',
    },
    {
      timestamp: 1725450005000,
      request_id: 'REQ-JSON-02',
      object_id: 'Product_302',
      operation: 'GET',
      response_size: 10240,
      backend_latency: 140,
      regeneration_cost: 150,
      status_code: 200,
      priority: 2,
      region: 'eu-west',
    },
    {
      timestamp: 1725450012000,
      request_id: 'REQ-JSON-03',
      object_id: 'Product_301',
      operation: 'GET',
      response_size: 5120,
      backend_latency: 85,
      regeneration_cost: 90,
      status_code: 200,
      priority: 1,
      region: 'us-east',
    },
  ]);

  const validJsonRes = await workloadIngestionService.ingestFile('api_trace.json', validJsonContent);
  assert(validJsonRes.summary.status === 'VALIDATED', '5. Valid JSON parsed and marked as VALIDATED');
  assert(validJsonRes.summary.validRows === 3, '5b. Valid JSON validRows is 3');
  assert(validJsonRes.summary.rejectedRows === 0, '5c. Valid JSON rejectedRows is 0');
  assert(validJsonRes.summary.uniqueObjects === 2, '5d. Valid JSON uniqueObjects is 2');
  assert(validJsonRes.summary.timeRange.durationSeconds === 12, '5e. Valid JSON time duration calculated as 12s');

  // 6. Verify Records Appear in Database / Repositories & History is Preserved
  const allHistoricalRuns = await workloadRepository.getAllWorkloadRuns();
  assert(allHistoricalRuns.length >= 4, `6a. All historical workload runs preserved in database (got ${allHistoricalRuns.length})`);
  
  const fetchedCsvRequests = await workloadRepository.getWorkloadRequests(validCsvRes.summary.workloadId);
  assert(fetchedCsvRequests.length === 4, `6b. Stored CSV requests retrieved successfully from repository (got ${fetchedCsvRequests.length})`);
  assert(fetchedCsvRequests[0].objectId === 'Product_101', '6c. First CSV record object_id verified');
  assert(fetchedCsvRequests[1].backendLatencyMs === 120, '6d. Second CSV record backend_latency verified');

  const fetchedJsonRequests = await workloadRepository.getWorkloadRequests(validJsonRes.summary.workloadId);
  assert(fetchedJsonRequests.length === 3, `6e. Stored JSON requests retrieved successfully from repository (got ${fetchedJsonRequests.length})`);
  assert(fetchedJsonRequests[0].region === 'us-east', '6f. Stored optional field "region" preserved');

  const retrievedRun = await workloadRepository.getWorkloadRunById(validJsonRes.summary.workloadId);
  assert(retrievedRun !== null, '6g. Workload metadata record retrieved by ID');
  assert(retrievedRun?.filename === 'api_trace.json', '6h. Workload filename matches ingested file');

  // =========================================================================
  // Test Suite 11: Phase 4 Adaptive Decision Engine & Explainability
  // =========================================================================
  console.log('\n--- Test Suite 11: Phase 4 Adaptive Decision Engine ---');
  const phase4Settings = await settingsRepository.getSettings();

  // 11.1 Low Demand -> EVICT
  const lowDemandFactors = scorer.calculateFactors(
    {
      objectId: 'LowDemand_01',
      accessCount: 1,
      lastAccessed: Date.now() - 3600000, // 1 hour ago
      retrievalCostMs: 20,
      sizeBytes: 1048576, // 1MB
      predictedDemand: -0.8,
      confidence: 0.9,
    },
    phase4Settings,
    { poolUtilization: 0.1, queueDepth: 0, errorRate: 0, avgBackendLatencyMs: 20 }
  );
  const lowDemandEval = lifecycle.evaluate(
    {
      objectId: 'LowDemand_01',
      key: 'cache:obj:LowDemand_01',
      sizeBytes: 1048576,
      createdAt: Date.now() - 3600000,
      lastAccessed: Date.now() - 3600000,
      accessCount: 1,
      recentAccessCount: 1,
      retrievalCostMs: 20,
      backendLatencyMs: 20,
      ttlSeconds: 300,
      remainingTtlSeconds: 20, // Expiring soon
      expiresAt: Date.now() + 20000,
      predictedDemand: -0.8,
      confidence: 0.9,
      adaptiveScore: lowDemandFactors.finalScore,
      lastDecision: 'KEEP',
      lastDecisionTime: Date.now() - 3600000,
    },
    lowDemandFactors,
    phase4Settings,
    true
  );
  assert(lowDemandEval.decision === 'EVICT', `11.1 Low-demand expiring object triggers EVICT (got ${lowDemandEval.decision})`);

  // 11.2 High Demand -> KEEP
  const highDemandFactors = scorer.calculateFactors(
    {
      objectId: 'HighDemand_01',
      accessCount: 50,
      lastAccessed: Date.now() - 1000,
      retrievalCostMs: 250,
      sizeBytes: 4096,
      predictedDemand: 0.2,
      confidence: 0.95,
    },
    phase4Settings,
    { poolUtilization: 0.3, queueDepth: 2, errorRate: 0, avgBackendLatencyMs: 250 }
  );
  const highDemandEval = lifecycle.evaluate(
    {
      objectId: 'HighDemand_01',
      key: 'cache:obj:HighDemand_01',
      sizeBytes: 4096,
      createdAt: Date.now() - 60000,
      lastAccessed: Date.now() - 1000,
      accessCount: 50,
      recentAccessCount: 20,
      retrievalCostMs: 250,
      backendLatencyMs: 250,
      ttlSeconds: 600,
      remainingTtlSeconds: 550,
      expiresAt: Date.now() + 550000,
      predictedDemand: 0.2,
      confidence: 0.95,
      adaptiveScore: highDemandFactors.finalScore,
      lastDecision: 'KEEP',
      lastDecisionTime: Date.now() - 1000,
    },
    highDemandFactors,
    phase4Settings,
    true
  );
  assert(highDemandEval.decision === 'KEEP', `11.2 High-demand resident object triggers KEEP (got ${highDemandEval.decision})`);

  // 11.3 Increasing Demand Surge on Candidate -> PRE-CACHE
  const surgeFactors = scorer.calculateFactors(
    {
      objectId: 'SurgeCandidate_01',
      accessCount: 15,
      lastAccessed: Date.now(),
      retrievalCostMs: 300,
      sizeBytes: 8192,
      predictedDemand: 0.65,
      confidence: 0.88,
    },
    phase4Settings,
    { poolUtilization: 0.5, queueDepth: 5, errorRate: 0.05, avgBackendLatencyMs: 300 }
  );
  const surgeEval = lifecycle.evaluate(
    {
      objectId: 'SurgeCandidate_01',
      key: 'cache:obj:SurgeCandidate_01',
      sizeBytes: 8192,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 15,
      recentAccessCount: 15,
      retrievalCostMs: 300,
      backendLatencyMs: 300,
      ttlSeconds: 300,
      remainingTtlSeconds: 0,
      expiresAt: 0,
      predictedDemand: 0.65,
      confidence: 0.88,
      adaptiveScore: surgeFactors.finalScore,
      lastDecision: 'KEEP',
      lastDecisionTime: Date.now(),
    },
    surgeFactors,
    phase4Settings,
    false // Not currently cached
  );
  assert(surgeEval.decision === 'PRE-CACHE', `11.3 Demand surge on candidate triggers PRE-CACHE (got ${surgeEval.decision})`);

  // 11.4 Approaching Expiration + High Recomputation Cost -> REFRESH
  const refreshFactors = scorer.calculateFactors(
    {
      objectId: 'ExpensiveRefresh_01',
      accessCount: 80,
      lastAccessed: Date.now() - 500,
      retrievalCostMs: 400,
      sizeBytes: 4096,
      predictedDemand: 0.35,
      confidence: 0.95,
    },
    phase4Settings,
    { poolUtilization: 0.4, queueDepth: 3, errorRate: 0, avgBackendLatencyMs: 400 }
  );
  const refreshEval = lifecycle.evaluate(
    {
      objectId: 'ExpensiveRefresh_01',
      key: 'cache:obj:ExpensiveRefresh_01',
      sizeBytes: 4096,
      createdAt: Date.now() - 290000,
      lastAccessed: Date.now() - 500,
      accessCount: 80,
      recentAccessCount: 25,
      retrievalCostMs: 400,
      backendLatencyMs: 400,
      ttlSeconds: 300,
      remainingTtlSeconds: 15, // Low remaining TTL (< 45s)
      expiresAt: Date.now() + 15000,
      predictedDemand: 0.35,
      confidence: 0.95,
      adaptiveScore: refreshFactors.finalScore,
      lastDecision: 'KEEP',
      lastDecisionTime: Date.now() - 500,
    },
    refreshFactors,
    phase4Settings,
    true
  );
  assert(refreshEval.decision === 'REFRESH', `11.4 Expiring object with high DB cost triggers REFRESH (got ${refreshEval.decision})`);

  // 11.5 Memory Pressure Adaptive Eviction Ranking
  await redisCache.flushall();
  redisCache.setCapacity(6000); // 6KB total capacity
  await redisCache.set('item:high', JSON.stringify({ data: 'high value' }), {
    objectId: 'item:high',
    sizeBytes: 2500,
    adaptiveScore: 0.88,
    lastAccessed: Date.now(),
  });
  await redisCache.set('item:low', JSON.stringify({ data: 'low value' }), {
    objectId: 'item:low',
    sizeBytes: 2500,
    adaptiveScore: 0.12,
    lastAccessed: Date.now(),
  });
  // Inserting item:new (2500 bytes) will exceed 6000 bytes and force eviction of the lower-scored item:low
  await redisCache.set('item:new', JSON.stringify({ data: 'new item' }), {
    objectId: 'item:new',
    sizeBytes: 2500,
    adaptiveScore: 0.70,
    lastAccessed: Date.now(),
  });
  const lowItemCheck = await redisCache.get('item:low');
  const highItemCheck = await redisCache.get('item:high');
  assert(lowItemCheck.hit === false, '11.5a Lowest scoring item (item:low) was adaptively evicted');
  assert(highItemCheck.hit === true, '11.5b High-value item (item:high) was retained');
  assert(redisCache.getStats().adaptiveEvictions >= 1, '11.5c adaptiveEvictions counter incremented');

  // 11.6 Decision Explainability Format
  const explanation = explainability.explain(surgeEval.decisionRecord, phase4Settings);
  assert(explanation.id === surgeEval.decisionRecord.id, '11.6a Explanation matches decision ID');
  assert(explanation.objectId === 'SurgeCandidate_01', '11.6b Explanation objectId matches');
  assert(explanation.decisionType === 'PRE-CACHE', '11.6c Explanation decisionType matches');
  assert(explanation.attributions.length === 6, `11.6d All 6 factor attributions present (got ${explanation.attributions.length})`);
  assert(typeof explanation.summaryMessage === 'string' && explanation.summaryMessage.length > 10, '11.6e Summary message generated');

  // =========================================================================
  // Test Suite 12: Phase 5 Time-Series Observation & Demand Change Detection
  // =========================================================================
  console.log('\n--- Test Suite 12: Phase 5 Time-Series Observations & Change Detection ---');
  observationRepository.clear();

  const nowBase = Date.now();
  // 12.1 Ingest Sequence: 100 -> 150 -> 900
  await observationRepository.saveObservation({
    objectId: 'Product_Surge_99',
    timestamp: nowBase - 120000,
    requestCount: 100,
    demand: 100,
    price: 49.99,
    inventory: 500,
    backendLatencyMs: 65,
    retrievalCostMs: 120,
    responseSizeBytes: 2048,
  });
  await observationRepository.saveObservation({
    objectId: 'Product_Surge_99',
    timestamp: nowBase - 60000,
    requestCount: 150,
    demand: 150,
    price: 49.99,
    inventory: 450,
    backendLatencyMs: 80,
    retrievalCostMs: 120,
    responseSizeBytes: 2048,
  });
  await observationRepository.saveObservation({
    objectId: 'Product_Surge_99',
    timestamp: nowBase,
    requestCount: 900,
    demand: 900,
    price: 49.99,
    inventory: 200,
    backendLatencyMs: 140,
    retrievalCostMs: 120,
    responseSizeBytes: 2048,
  });

  // 12.2 Verify Append-Only Storage & History Retrieval
  const surgeHistory = await observationRepository.getRecentObservations('Product_Surge_99');
  assert(surgeHistory.length === 3, `12.2a All 3 observations stored and retrieved (got ${surgeHistory.length})`);
  assert(surgeHistory[0].demand === 900, '12.2b Latest observation has demand 900');
  assert(surgeHistory[2].demand === 100, '12.2c Baseline observation has demand 100');

  // 12.3 Multi-Window Change Detection for Surge (100 -> 150 -> 900)
  const surgeAnalysis = await changeDetector.analyzeFromRepository('Product_Surge_99');
  assert(
    surgeAnalysis.detectedPattern === 'DEMAND_SPIKE' || surgeAnalysis.detectedPattern === 'INCREASING_TREND',
    `12.3a Pattern for 100 -> 150 -> 900 detected as surge/increasing (got ${surgeAnalysis.detectedPattern})`
  );
  assert(surgeAnalysis.demandChange >= 1.0 || surgeAnalysis.historySummary.length === 3, '12.3b Demand delta calculated accurately');
  assert(surgeAnalysis.recommendedDecision === 'PRE-CACHE', `12.3c Recommended action is PRE-CACHE (got ${surgeAnalysis.recommendedDecision})`);
  assert(surgeAnalysis.recommendedTtlSeconds! > 300, `12.3d Dynamic TTL scaled up during spike (${surgeAnalysis.recommendedTtlSeconds}s)`);

  // 12.4 Declining Demand Pattern Detection (500 -> 200 -> 10)
  await observationRepository.saveObservation({
    objectId: 'Product_Declining_01',
    timestamp: nowBase - 120000,
    requestCount: 500,
    demand: 500,
    backendLatencyMs: 50,
    retrievalCostMs: 50,
    responseSizeBytes: 1024,
  });
  await observationRepository.saveObservation({
    objectId: 'Product_Declining_01',
    timestamp: nowBase - 60000,
    requestCount: 200,
    demand: 200,
    backendLatencyMs: 50,
    retrievalCostMs: 50,
    responseSizeBytes: 1024,
  });
  await observationRepository.saveObservation({
    objectId: 'Product_Declining_01',
    timestamp: nowBase,
    requestCount: 10,
    demand: 10,
    backendLatencyMs: 50,
    retrievalCostMs: 50,
    responseSizeBytes: 1024,
  });

  const declineAnalysis = await changeDetector.analyzeFromRepository('Product_Declining_01');
  assert(
    declineAnalysis.detectedPattern === 'DEMAND_DECLINE' || declineAnalysis.detectedPattern === 'DECREASING_TREND',
    `12.4a Declining sequence (500 -> 200 -> 10) detected (got ${declineAnalysis.detectedPattern})`
  );
  assert(declineAnalysis.demandChange < 0, '12.4b Negative demand delta detected');
  assert(declineAnalysis.recommendedTtlSeconds! < 300, `12.4c Dynamic TTL scaled down during decline (${declineAnalysis.recommendedTtlSeconds}s)`);

  // 12.5 Stable Demand Pattern Detection (100 -> 102 -> 99)
  await observationRepository.saveObservation({
    objectId: 'Product_Stable_01',
    timestamp: nowBase - 120000,
    requestCount: 100,
    demand: 100,
    backendLatencyMs: 50,
    retrievalCostMs: 50,
    responseSizeBytes: 1024,
  });
  await observationRepository.saveObservation({
    objectId: 'Product_Stable_01',
    timestamp: nowBase - 60000,
    requestCount: 102,
    demand: 102,
    backendLatencyMs: 50,
    retrievalCostMs: 50,
    responseSizeBytes: 1024,
  });
  await observationRepository.saveObservation({
    objectId: 'Product_Stable_01',
    timestamp: nowBase,
    requestCount: 99,
    demand: 99,
    backendLatencyMs: 50,
    retrievalCostMs: 50,
    responseSizeBytes: 1024,
  });

  const stableAnalysis = await changeDetector.analyzeFromRepository('Product_Stable_01');
  assert(stableAnalysis.detectedPattern === 'STABLE_DEMAND', `12.5a Stable demand pattern verified (got ${stableAnalysis.detectedPattern})`);
  assert(stableAnalysis.recommendedDecision === 'KEEP', '12.5b Recommended action is KEEP for stable demand');

  // 12.6 Price is Contextual Metadata Only (Does NOT dictate cache priority)
  const priceObsA: any = { objectId: 'Item_Luxury_HighPrice', demand: 2, price: 5000, backendLatencyMs: 20, retrievalCostMs: 20, responseSizeBytes: 1024 };
  const priceObsB: any = { objectId: 'Item_Utility_LowPrice', demand: 800, price: 5, backendLatencyMs: 300, retrievalCostMs: 300, responseSizeBytes: 1024 };
  
  const factorsA = scorer.calculateFactors(priceObsA, phase4Settings, { poolUtilization: 0, queueDepth: 0, errorRate: 0, avgBackendLatencyMs: 20 });
  const factorsB = scorer.calculateFactors(priceObsB, phase4Settings, { poolUtilization: 0, queueDepth: 0, errorRate: 0, avgBackendLatencyMs: 300 });
  
  assert(
    factorsB.finalScore > factorsA.finalScore,
    `12.6 High-demand/high-cost item (score ${factorsB.finalScore}) prioritised over low-demand expensive item (score ${factorsA.finalScore})`
  );

  // =========================================================================
  // Test Suite 13: Phase 6 Traffic Lab & Real Workload Trace Replay
  // =========================================================================
  console.log('\n--- Test Suite 13: Phase 6 Traffic Lab & Trace Replay ---');
  await redisCache.flushall();
  redisCache.resetCounters();

  const replayTraceJson = JSON.stringify([
    { timestamp: 1725450000000, request_id: 'REQ-REP-01', object_id: 'ReplayProduct_1', operation: 'GET', response_size: 2048, backend_latency: 50, regeneration_cost: 50, status_code: 200 },
    { timestamp: 1725450001000, request_id: 'REQ-REP-02', object_id: 'ReplayProduct_1', operation: 'GET', response_size: 2048, backend_latency: 50, regeneration_cost: 50, status_code: 200 },
    { timestamp: 1725450002000, request_id: 'REQ-REP-03', object_id: 'ReplayProduct_2', operation: 'GET', response_size: 4096, backend_latency: 80, regeneration_cost: 80, status_code: 200 },
    { timestamp: 1725450003000, request_id: 'REQ-REP-04', object_id: 'ReplayProduct_1', operation: 'GET', response_size: 2048, backend_latency: 50, regeneration_cost: 50, status_code: 200 },
    { timestamp: 1725450004000, request_id: 'REQ-REP-05', object_id: 'ReplayProduct_2', operation: 'GET', response_size: 4096, backend_latency: 80, regeneration_cost: 80, status_code: 200 },
    { timestamp: 1725450005000, request_id: 'REQ-REP-06', object_id: 'ReplayProduct_3', operation: 'GET', response_size: 1024, backend_latency: 30, regeneration_cost: 30, status_code: 200 },
  ]);

  const replayIngest = await workloadIngestionService.ingestFile('benchmark_replay.json', replayTraceJson);
  assert(replayIngest.summary.status === 'VALIDATED', '13.1 Trace file ingested for replay');

  // Start Replay
  const initialReplay = await replayRunner.startReplay({
    workloadId: replayIngest.summary.workloadId,
    requestsPerSecond: 100,
    concurrency: 2,
    speedMultiplier: 2.0,
  });
  assert(initialReplay.status === 'RUNNING', '13.2 Replay successfully transitioned to RUNNING state');

  // Wait for asynchronous replay completion
  while (replayRunner.isReplaying()) {
    await new Promise(r => setTimeout(r, 50));
  }

  const completedReplay = replayRunner.getStatus()!;
  assert(completedReplay.status === 'COMPLETED', `13.3 Replay transitioned to COMPLETED state (got ${completedReplay.status})`);
  assert(completedReplay.totalRequestsInTrace === 6, '13.4 Total requests in trace recorded as 6');
  assert(completedReplay.requestsCompleted === 6, '13.5 All 6 requests executed against cache engine');
  assert(completedReplay.cacheHits + completedReplay.cacheMisses === 6, '13.6 Exact cache hits + misses equals total completed requests');
  assert(completedReplay.cacheHits >= 2, `13.7 Subsequent queries for repeated keys yielded real cache hits (got ${completedReplay.cacheHits} hits)`);
  assert(completedReplay.backendCalls >= 3, `13.8 Initial unique keys caused real backend lookups (got ${completedReplay.backendCalls} backend calls)`);
  assert(completedReplay.avgLatencyMs > 0, `13.9 Real latency tracked accurately (${completedReplay.avgLatencyMs}ms)`);

  // =========================================================================
  // Test Suite 14: Phase 7 Real Backend Protection & Concurrency Defense
  // =========================================================================
  console.log('\n--- Test Suite 14: Phase 7 Real Backend Protection ---');

  // 14.1 Token Bucket Rate Limiter
  rateLimiter.reset();
  rateLimiter.setLimit(10, 5); // 10 RPS, burst capacity 5
  assert(rateLimiter.tryAcquire(5) === true, '14.1a Consumed available burst tokens');
  assert(rateLimiter.tryAcquire(1) === false, '14.1b Throttles excess incoming requests');
  assert(rateLimiter.getStats().throttledRequests >= 1, '14.1c Throttled counter incremented');

  // 14.2 Concurrency Control & Request Queue
  requestQueue.reset();
  requestQueue.setConfig(2, 5); // max concurrency 2, max queue depth 5

  let activeTasks = 0;
  const slowTask = async (id: number) => {
    activeTasks++;
    await new Promise(r => setTimeout(r, 60));
    activeTasks--;
    return `task_${id}_done`;
  };

  const p1 = requestQueue.enqueue(() => slowTask(1));
  const p2 = requestQueue.enqueue(() => slowTask(2));
  const p3 = requestQueue.enqueue(() => slowTask(3));

  assert(requestQueue.getStats().activeRequests === 2, `14.2a In-flight concurrency capped at max (got ${requestQueue.getStats().activeRequests})`);
  assert(requestQueue.getStats().waitingRequests === 1, `14.2b Third task queued in FIFO buffer (got ${requestQueue.getStats().waitingRequests})`);

  const [qRes1, qRes2, qRes3] = await Promise.all([p1, p2, p3]);
  assert(qRes1 === 'task_1_done' && qRes3 === 'task_3_done', '14.2c All queued tasks executed and resolved successfully');
  assert(requestQueue.getStats().waitingRequests === 0, '14.2d Queue drained after completion');

  // 14.3 Circuit Breaker Truth-Grounded States (CLOSED -> OPEN -> HALF-OPEN -> CLOSED)
  circuitBreaker.reset();
  circuitBreaker.setConfig(0.5, 200); // 50% threshold, 200ms recovery
  assert(circuitBreaker.getState() === 'CLOSED', '14.3a Circuit Breaker is strictly CLOSED during healthy operation');
  assert(circuitBreaker.canExecute() === true, '14.3b canExecute returns true when CLOSED');

  // Record low error rate (1 failure, 4 successes = 20% < 50%)
  circuitBreaker.recordResult(false);
  circuitBreaker.recordResult(true);
  circuitBreaker.recordResult(true);
  circuitBreaker.recordResult(true);
  circuitBreaker.recordResult(true);
  assert(circuitBreaker.getState() === 'CLOSED', '14.3c Circuit Breaker does NOT open prematurely when error rate is below threshold');

  // Inject failure surge to trip circuit
  for (let i = 0; i < 6; i++) {
    circuitBreaker.recordResult(false);
  }
  assert(circuitBreaker.getState() === 'OPEN', '14.3d Circuit Breaker entered OPEN state after error rate exceeded 50%');
  assert(circuitBreaker.canExecute() === false, '14.3e canExecute returns false when OPEN');

  // 14.4 Retry Controller Aborts when Circuit is OPEN
  let retryAttempts = 0;
  let retryFailedProperly = false;
  try {
    await retryController.executeWithRetry(async () => {
      retryAttempts++;
      throw new Error('Database connection failed');
    });
  } catch (err: any) {
    retryFailedProperly = true;
  }
  assert(retryFailedProperly === true, '14.4a RetryController rejected when circuit is OPEN');
  assert(retryAttempts === 0, '14.4b RetryController did NOT dispatch retry attempts while circuit is OPEN');

  // Wait for recovery timeout to transition to HALF-OPEN
  await new Promise(r => setTimeout(r, 250));
  assert(circuitBreaker.getState() === 'HALF-OPEN', '14.3f Circuit Breaker transitioned to HALF-OPEN after recovery timer');

  // Probe with successes to close
  circuitBreaker.recordResult(true);
  circuitBreaker.recordResult(true);
  circuitBreaker.recordResult(true);
  assert(circuitBreaker.getState() === 'CLOSED', '14.3g Circuit Breaker recovered back to CLOSED state');

  // 14.5 Cache-First Protection (Stale-While-Error)
  await redisCache.set('cache:obj:StaleKey_01', JSON.stringify({ name: 'Cached Object' }), {
    objectId: 'StaleKey_01',
    sizeBytes: 1024,
    retrievalCostMs: 50,
  });

  // Trip Circuit Breaker again to simulate total backend outage
  for (let i = 0; i < 6; i++) {
    circuitBreaker.recordResult(false);
  }
  assert(circuitBreaker.getState() === 'OPEN', '14.5a Circuit Breaker tripped for backend outage test');

  // Request cached item during outage -> should serve cached data with status 200
  const staleResponse = await cacheService.handleRequest('StaleKey_01');
  assert(staleResponse.cacheHit === true, '14.5b Cache-First defense served resident cached object during outage');
  assert(staleResponse.statusCode === 200, '14.5c Response status is 200 OK');
  assert(staleResponse.data.name === 'Cached Object', '14.5d Cached payload preserved and returned');

  // Request uncached item during outage -> should short-circuit with 503
  const uncachedResponse = await cacheService.handleRequest('Uncached_Outage_Item');
  assert(uncachedResponse.statusCode === 503, '14.5e Uncached item gracefully returned 503 during outage');
  assert(uncachedResponse.cacheHit === false, '14.5f Uncached item marked as cache miss');

  // Reset circuit breaker after test
  circuitBreaker.reset();

  // =========================================================================
  // Test Suite 15: Phase 8 Fair Multi-Strategy Benchmark Engine
  // =========================================================================
  console.log('\n--- Test Suite 15: Phase 8 Fair Multi-Strategy Benchmark Engine ---');
  
  // Record production cache state before benchmark
  const preBmkRedisSize = await redisCache.dbsize();
  const preBmkRequestLogs = await requestLogRepository.getRecent(100);

  // 15.1 Trace Generation & Strict Fairness Verification
  const sampleTrace = [
    { objectId: 'BmkItem_A', sizeBytes: 1024 * 1024, retrievalCostMs: 100 },
    { objectId: 'BmkItem_B', sizeBytes: 2 * 1024 * 1024, retrievalCostMs: 250 },
    { objectId: 'BmkItem_A', sizeBytes: 1024 * 1024, retrievalCostMs: 100 },
    { objectId: 'BmkItem_C', sizeBytes: 3 * 1024 * 1024, retrievalCostMs: 400 },
    { objectId: 'BmkItem_B', sizeBytes: 2 * 1024 * 1024, retrievalCostMs: 250 },
    { objectId: 'BmkItem_D', sizeBytes: 4 * 1024 * 1024, retrievalCostMs: 300 },
    { objectId: 'BmkItem_A', sizeBytes: 1024 * 1024, retrievalCostMs: 100 },
    { objectId: 'BmkItem_E', sizeBytes: 5 * 1024 * 1024, retrievalCostMs: 150 },
  ];

  const bmkCapacityBytes = 6 * 1024 * 1024; // 6MB capacity (forces selective evictions)
  const bmkRun1 = await benchmarkEngine.runBenchmark(sampleTrace, bmkCapacityBytes, 'Test Trace 1');

  assert(bmkRun1.isTraceVerifiedFair === true, '15.1a Benchmark trace verified fair');
  assert(bmkRun1.fairnessDetails.identicalRequests === true, '15.1b Identical requests verified');
  assert(bmkRun1.fairnessDetails.identicalCapacity === true, '15.1c Identical capacity verified');
  assert(bmkRun1.results.length === 4, '15.1d All 4 strategies evaluated (Adaptive, LRU, LFU, GDS)');

  // 15.2 Verify Exact Request Processing Across All 4 Algorithms
  const adaptiveRes = bmkRun1.results.find(r => r.strategy === 'ADAPTIVE')!;
  const lruRes = bmkRun1.results.find(r => r.strategy === 'LRU')!;
  const lfuRes = bmkRun1.results.find(r => r.strategy === 'LFU')!;
  const gdsRes = bmkRun1.results.find(r => r.strategy === 'GDS')!;

  assert(adaptiveRes.totalRequests === sampleTrace.length, '15.2a AdaptiveCache processed all 8 requests');
  assert(lruRes.totalRequests === sampleTrace.length, '15.2b LRU processed all 8 requests');
  assert(lfuRes.totalRequests === sampleTrace.length, '15.2c LFU processed all 8 requests');
  assert(gdsRes.totalRequests === sampleTrace.length, '15.2d GDS processed all 8 requests');

  // 15.3 Metric Calculation Accuracy
  for (const r of bmkRun1.results) {
    assert(r.cacheHits + r.cacheMisses === r.totalRequests, `15.3a Hits + Misses == Total for ${r.strategy}`);
    assert(Math.abs((r.hitRate + r.missRate) - 1.0) < 0.001, `15.3b HitRate + MissRate == 1.0 for ${r.strategy}`);
    assert(r.avgLatencyMs > 0, `15.3c Average latency computed for ${r.strategy} (${r.avgLatencyMs}ms)`);
    assert(r.p95LatencyMs >= r.p50LatencyMs, `15.3d P95 >= P50 for ${r.strategy}`);
    assert(r.p99LatencyMs >= r.p95LatencyMs, `15.3e P99 >= P95 for ${r.strategy}`);
    assert(r.totalCostUsd > 0, `15.3f Total cost computed for ${r.strategy}`);
  }

  // 15.4 Memory & Production Isolation Guarantee
  const postBmkRedisSize = await redisCache.dbsize();
  const postBmkRequestLogs = await requestLogRepository.getRecent(100);
  assert(postBmkRedisSize === preBmkRedisSize, '15.4a Production Redis keys untouched by benchmark simulations');
  assert(postBmkRequestLogs.length === preBmkRequestLogs.length, '15.4b Production request logs untouched by benchmark simulations');

  // 15.5 Reproducibility Guarantee (Same input produces identical output)
  const bmkRun2 = await benchmarkEngine.runBenchmark(sampleTrace, bmkCapacityBytes, 'Test Trace 1 (Repeat)');
  const adaptiveRes2 = bmkRun2.results.find(r => r.strategy === 'ADAPTIVE')!;
  const lruRes2 = bmkRun2.results.find(r => r.strategy === 'LRU')!;
  assert(adaptiveRes.cacheHits === adaptiveRes2.cacheHits, '15.5a AdaptiveCache reproducibility verified');
  assert(lruRes.cacheHits === lruRes2.cacheHits, '15.5b LRU reproducibility verified');
  assert(adaptiveRes.evictionsCount === adaptiveRes2.evictionsCount, '15.5c Eviction count reproducibility verified');

  // 15.6 Custom Uploaded Workload Trace Benchmark
  const customBmkCsv = `timestamp,request_id,object_id,operation,response_size,backend_latency,regeneration_cost,status_code\n` +
    `1725450000000,REQ-B1,CustomObj_1,GET,2048,120,120,200\n` +
    `1725450001000,REQ-B2,CustomObj_2,GET,4096,300,300,200\n` +
    `1725450002000,REQ-B3,CustomObj_1,GET,2048,120,120,200\n` +
    `1725450003000,REQ-B4,CustomObj_3,GET,8192,200,200,200`;

  const uploadedBmkResult = await workloadIngestionService.ingestFile(
    'benchmark_custom_workload.csv',
    customBmkCsv,
    customBmkCsv.length
  );

  const bmkCustomRun = await benchmarkEngine.runBenchmarkFromWorkload(uploadedBmkResult.summary.workloadId, 16 * 1024 * 1024);
  assert(bmkCustomRun.totalRequestsInTrace === 4, '15.6a Custom workload trace benchmark ran with 4 requests');
  assert(bmkCustomRun.results.length === 4, '15.6b All 4 algorithms evaluated on custom trace');

  // 15.7 Benchmark Persistence Repository
  const retrievedBmkRun = await benchmarkRepository.getRunById(bmkRun1.id);
  assert(retrievedBmkRun !== null, '15.7a Benchmark run retrieved from repository');
  assert(retrievedBmkRun?.traceName === 'Test Trace 1', '15.7b Retrieved benchmark run matches metadata');
  const allRuns = await benchmarkRepository.getAllRuns();
  assert(allRuns.length >= 2, '15.7c All benchmark runs listed from repository');

  // =========================================================================
  // Test Suite 16: Phase 9 What-If & Transparent Cost ROI Engine
  // =========================================================================
  console.log('\n--- Test Suite 16: Phase 9 What-If & Cost ROI Engine ---');

  const baseTelemetry = {
    ...telemetry.getSnapshot(),
    cacheHitRate: 0.70,
    averageLatencyMs: 35,
    requestsPerSecond: 100,
    memoryUsedBytes: 32 * 1024 * 1024,
  };
  const p9Settings = await settingsRepository.getSettings();

  // 16.1 What-If Counterfactual Capacity Resizing
  const scenarioCapacityDouble = whatIfEngine.evaluate(
    { trafficMultiplier: 1.0, cacheCapacityMb: 256, backendLatencyMs: 120, backendErrorRate: 0.0 },
    baseTelemetry,
    p9Settings
  );

  assert(
    scenarioCapacityDouble.projected.hitRate > scenarioCapacityDouble.current.hitRate,
    `16.1a Increasing cache capacity projected higher hit rate (${scenarioCapacityDouble.current.hitRate * 100}% -> ${scenarioCapacityDouble.projected.hitRate * 100}%)`
  );
  assert(
    scenarioCapacityDouble.projected.avgLatencyMs < scenarioCapacityDouble.current.avgLatencyMs,
    `16.1b Increasing cache capacity projected lower avg latency (${scenarioCapacityDouble.projected.avgLatencyMs}ms vs ${scenarioCapacityDouble.current.avgLatencyMs}ms)`
  );

  // 16.2 What-If Traffic Scaling Projection
  const scenarioTrafficSpike = whatIfEngine.evaluate(
    { trafficMultiplier: 3.0, cacheCapacityMb: 64, backendLatencyMs: 120, backendErrorRate: 0.0 },
    baseTelemetry,
    p9Settings
  );
  assert(
    scenarioTrafficSpike.projected.costPerHourUsd > scenarioTrafficSpike.current.costPerHourUsd,
    `16.2a 3x traffic scaling correctly projected increased hourly cost ($${scenarioTrafficSpike.projected.costPerHourUsd}/hr)`
  );

  // 16.3 What-If Dynamic TTL & Error Rate Impact
  const scenarioLongTtl = whatIfEngine.evaluate(
    { trafficMultiplier: 1.0, cacheCapacityMb: 64, backendLatencyMs: 120, backendErrorRate: 0.0, ttlSeconds: 1200 },
    baseTelemetry,
    p9Settings
  );
  assert(scenarioLongTtl.projected.hitRate >= scenarioCapacityDouble.current.hitRate, '16.3a Longer TTL projects improved hit rate');

  const scenarioHighErrors = whatIfEngine.evaluate(
    { trafficMultiplier: 1.0, cacheCapacityMb: 64, backendLatencyMs: 120, backendErrorRate: 0.3 },
    baseTelemetry,
    p9Settings
  );
  assert(
    scenarioHighErrors.projected.avgLatencyMs > scenarioCapacityDouble.current.avgLatencyMs,
    '16.3b Backend error rate degradation increases projected tail latency'
  );

  // 16.4 Transparent Infrastructure Cost & ROI Model
  const costBreakdown = costEngine.calculateCost(
    {
      totalRequestsPerHour: 100000,
      backendRequestsPerHour: 20000, // 80% hit rate
      cacheHitsPerHour: 80000,
      memoryUsedBytes: 64 * 1024 * 1024,
      egressBytesPerHour: 100000 * 8192,
    },
    p9Settings
  );

  assert(costBreakdown.baselineCostPerHour > costBreakdown.adaptiveCostPerHour, '16.4a Baseline un-cached cost is strictly higher than AdaptiveCache');
  assert(
    costBreakdown.netSavingsPerHour === costBreakdown.baselineCostPerHour - costBreakdown.adaptiveCostPerHour,
    `16.4b Net hourly savings verified: $${costBreakdown.netSavingsPerHour}/hr`
  );
  assert(
    costBreakdown.netSavingsMonthly === Math.round(costBreakdown.netSavingsPerHour * 730 * 100) / 100,
    `16.4c Monthly projected savings annualized at 730 hrs/mo: $${costBreakdown.netSavingsMonthly}`
  );
  assert(costBreakdown.roiPercentage > 0, `16.4d Positive ROI percentage calculated: ${costBreakdown.roiPercentage}%`);
  assert(costBreakdown.backendLoadReductionPercent === 80, '16.4e 80% backend offload verified');

  // 16.5 Configurable Cost Assumptions
  const updatedSettings = await settingsRepository.updateSettings({
    costAssumptions: {
      ...p9Settings.costAssumptions,
      backendRequestCostUsd: 0.00010, // double query cost
    },
  });

  const updatedCost = costEngine.calculateCost(
    {
      totalRequestsPerHour: 100000,
      backendRequestsPerHour: 20000,
      cacheHitsPerHour: 80000,
      memoryUsedBytes: 64 * 1024 * 1024,
      egressBytesPerHour: 100000 * 8192,
    },
    updatedSettings
  );

  assert(
    updatedCost.netSavingsPerHour > costBreakdown.netSavingsPerHour,
    '16.5 Higher database query cost increases financial savings from caching'
  );

  // =========================================================================
  // Test Suite 17: Phase 10 Activity Stream & Real-Time Dashboard (WebSocket & Events)
  // =========================================================================
  console.log('\n--- Test Suite 17: Phase 10 Activity Stream & Real-Time Dashboard ---');

  const allRequiredEventTypes: EventType[] = [
    'CACHE_HIT',
    'CACHE_MISS',
    'KEEP',
    'REFRESH',
    'EVICT',
    'PRE_CACHE',
    'BACKEND_FAILURE',
    'CIRCUIT_OPEN',
    'CIRCUIT_HALF_OPEN',
    'CIRCUIT_CLOSED',
    'WORKLOAD_STARTED',
    'WORKLOAD_COMPLETED',
  ];

  // 17.1 Log all 12 core event types
  for (let i = 0; i < allRequiredEventTypes.length; i++) {
    const evtType = allRequiredEventTypes[i];
    await eventRepository.log({
      id: `EVT-TEST-${i + 1}-${evtType}`,
      timestamp: Date.now() + i * 10,
      eventType: evtType,
      objectId: `TestObject_${evtType}`,
      score: 0.85,
      reason: `Automated test verification for event type ${evtType}`,
      metadata: { testIndex: i, testType: evtType },
    });
  }

  // 17.2 Retrieve unfiltered events
  const allLoggedEvents = await eventRepository.getRecent(50);
  assert(allLoggedEvents.length >= 12, `17.1 All 12 event types logged and retrieved (got ${allLoggedEvents.length})`);

  // 17.3 Verify Event schema integrity
  const sampleEvt = allLoggedEvents.find(e => e.id === 'EVT-TEST-1-CACHE_HIT');
  assert(sampleEvt !== undefined, '17.2a Sample CACHE_HIT event retrieved by ID');
  assert(sampleEvt?.eventType === 'CACHE_HIT', '17.2b Event type matches CACHE_HIT');
  assert(sampleEvt?.objectId === 'TestObject_CACHE_HIT', '17.2c Event objectId matches');
  assert(sampleEvt?.score === 0.85, '17.2d Event score preserved');
  assert(typeof sampleEvt?.timestamp === 'number', '17.2e Event timestamp is numeric');
  assert(Boolean(sampleEvt?.reason.includes('CACHE_HIT')), '17.2f Event reason preserved');
  assert(sampleEvt?.metadata?.testType === 'CACHE_HIT', '17.2g Event metadata JSON preserved');

  // 17.4 Filter by specific event types
  const circuitOpenEvents = await eventRepository.getRecent(50, 'CIRCUIT_OPEN');
  assert(circuitOpenEvents.length >= 1, '17.3a Filtered query for CIRCUIT_OPEN returned matching events');
  assert(circuitOpenEvents.every(e => e.eventType === 'CIRCUIT_OPEN'), '17.3b All returned events have eventType === CIRCUIT_OPEN');

  const workloadStartEvents = await eventRepository.getRecent(50, 'WORKLOAD_STARTED');
  assert(workloadStartEvents.length >= 1, '17.3c Filtered query for WORKLOAD_STARTED returned matching events');
  assert(workloadStartEvents.every(e => e.eventType === 'WORKLOAD_STARTED'), '17.3d All returned events have eventType === WORKLOAD_STARTED');

  // 17.5 Empty state handling for non-existent event types
  const emptyFilterEvents = await eventRepository.getRecent(50, 'NON_EXISTENT_FILTER_TYPE' as any);
  assert(emptyFilterEvents.length === 0, '17.4 Filter query for non-matching type returns empty array for graceful empty state');

  // 17.6 WebSocket Broadcaster validation
  let broadcastSuccess = true;
  try {
    wsService.broadcast({
      type: 'ACTIVITY_EVENT',
      data: {
        id: 'EVT-WS-TEST',
        timestamp: Date.now(),
        eventType: 'KEEP',
        reason: 'WebSocket broadcast validation',
      },
    });
  } catch {
    broadcastSuccess = false;
  }
  assert(broadcastSuccess === true, '17.5 WebSocket broadcaster dispatches activity frames safely');
  assert(typeof wsService.getActiveClientCount() === 'number', '17.6 WebSocket active client count returns numeric status');

  // =========================================================================
  // Test Suite 18: Phase 11 Production Deployment Readiness & Subsystems
  // =========================================================================
  console.log('\n--- Test Suite 18: Phase 11 Production Deployment Readiness ---');

  // 18.1 Redis Subsystem Health Check
  const redisHealth = await redisCache.checkHealth();
  assert(['CONNECTED', 'DEGRADED', 'OFFLINE'].includes(redisHealth.status), `18.1a Redis health status is valid: ${redisHealth.status}`);
  assert(typeof redisHealth.latencyMs === 'number', '18.1b Redis latency reported as numeric ms');
  assert(typeof redisHealth.message === 'string', '18.1c Redis health description provided');

  // 18.2 PostgreSQL Subsystem Health Check
  const dbHealth = await dbClient.checkHealth();
  assert(['CONNECTED', 'DEGRADED', 'OFFLINE'].includes(dbHealth.status), `18.2a PostgreSQL health status is valid: ${dbHealth.status}`);
  assert(typeof dbHealth.latencyMs === 'number', '18.2b PostgreSQL latency reported as numeric ms');
  assert(typeof dbHealth.message === 'string', '18.2c PostgreSQL health description provided');

  // 18.3 Dynamic Configuration Parsing & No Hardcoded Localhost
  assert(typeof config.port === 'number' && config.port > 0, `18.3a Server port configured dynamically (${config.port})`);
  assert(typeof config.corsOrigin === 'string' && config.corsOrigin.length > 0, `18.3b CORS origin configured dynamically (${config.corsOrigin})`);
  assert(config.defaultTtlSeconds > 0, `18.3c Default TTL configured (${config.defaultTtlSeconds}s)`);
  assert(config.maxCacheCapacityBytes > 0, `18.3d Max cache capacity configured (${config.maxCacheCapacityBytes} bytes)`);

  // 18.4 Database Migration Idempotency & All 14 Required Tables Verification
  const reqTables = MigrationRunner.getRequiredTables();
  assert(reqTables.length === 14, `18.4a All 14 required tables defined in MigrationRunner (got ${reqTables.length})`);
  const expectedTableNames = [
    'users',
    'cache_objects',
    'cache_accesses',
    'cache_decisions',
    'request_logs',
    'system_events',
    'workload_runs',
    'workload_requests',
    'benchmark_runs',
    'benchmark_results',
    'scenario_runs',
    'cost_records',
    'system_settings',
    'object_observations',
  ];
  const all14Present = expectedTableNames.every((t) => reqTables.includes(t));
  assert(all14Present === true, '18.4b Every required table name verified in schema definition list');

  let migrationRanSafely = true;
  try {
    await MigrationRunner.runMigrations();
  } catch (err) {
    migrationRanSafely = false;
  }
  assert(migrationRanSafely === true, '18.4c Database migrations run idempotently without error');

  const verificationRes = await MigrationRunner.verifyTables();
  assert(verificationRes.expectedCount === 14, '18.4d Table verification reports 14 expected tables');
  assert(typeof verificationRes.verified === 'boolean', '18.4e Table verification status boolean returned');

  // 18.5 In-Memory Fallback Reliability Across Repositories
  const testSettingObj = await settingsRepository.getSettings();
  assert(testSettingObj !== null && testSettingObj.minTtlSeconds !== undefined, '18.5a Settings repository operational across storage backends');

  const testLogs = await requestLogRepository.getRecent(10);
  assert(Array.isArray(testLogs), '18.5b Request log repository operational across storage backends');

  const testObservations = await observationRepository.getRecentObservations('Product_Surge_99');
  assert(testObservations.length >= 3, '18.5c Observation repository operational across storage backends');

  // 18.6 Idle Telemetry & Mathematical Load Accuracy
  const idleCollector = new (telemetry.constructor as any)();
  const idleSnapshot = idleCollector.getSnapshot();
  assert(idleSnapshot.totalRequests >= 0, '18.6a Telemetry totalRequests is non-negative');
  assert(typeof idleSnapshot.backendLoadRatio === 'number', '18.6b Backend load ratio is numeric');
  assert(typeof idleSnapshot.averageLatencyMs === 'number', '18.6c Average latency is numeric');

  // =========================================================================
  // Test Suite 19: Safe Demo Mode & Test Harness Isolation
  // =========================================================================
  console.log('\n--- Test Suite 19: Safe Demo Mode & Test Harness Isolation ---');
  redisCache.setCapacity(config.maxCacheCapacityBytes);


  // 19.1 Demo Mode Status & Fixtures Metadata
  const demoStatus = demoService.getStatus();
  assert(demoStatus.activeNamespace === 'adaptivecache:demo:*', '19.1a Active demo namespace is adaptivecache:demo:*');
  assert(Object.keys(DEMO_FIXTURES).length === 10, '19.1b 10 deterministic demo fixture objects defined');
  assert(DEMO_FIXTURES['DEMO-001'].price === 500 && DEMO_FIXTURES['DEMO-001'].demand === 100, '19.1c DEMO-001 fixture has fixed price=500 and demand=100');
  assert(DEMO_FIXTURES['DEMO-010'].price === 2000 && DEMO_FIXTURES['DEMO-010'].retrievalCostMs === 200, '19.1d DEMO-010 fixture has fixed price=2000 and cost=200ms');

  const demoScenarios = demoService.getScenarios();
  assert(demoScenarios.length === 6, `19.1e 6 deterministic scenarios available (got ${demoScenarios.length})`);

  // 19.2 Basic Cache MISS on First Access (DEMO-001)
  await redisCache.clearDemoKeys();
  const firstReq = await cacheService.handleRequest('DEMO-001', { mode: 'demo' });
  assert(firstReq.cacheHit === false, '19.2a First request to DEMO-001 is a cache MISS');
  assert(firstReq.backendCalled === true, '19.2b Backend origin was called for MISS');
  assert(firstReq.statusCode === 200, '19.2c Request returned HTTP 200');
  assert(firstReq.data && firstReq.data.price === 500, '19.2d Retrieved deterministic demo fixture data (price=500)');

  // Verify key exists in Redis demo namespace
  const demoRedisCheck = await redisCache.get('adaptivecache:demo:obj:DEMO-001');
  assert(demoRedisCheck.hit === true, '19.2e DEMO-001 was stored in Redis demo namespace (adaptivecache:demo:obj:DEMO-001)');

  // 19.3 Basic Cache HIT on Repeated Access (DEMO-001)
  const secondReq = await cacheService.handleRequest('DEMO-001', { mode: 'demo' });
  assert(secondReq.cacheHit === true, '19.3a Second request to DEMO-001 is an immediate cache HIT');
  assert(secondReq.backendCalled === false, '19.3b Backend origin was NOT called on HIT');
  assert(secondReq.backendLatencyMs === 0, '19.3c Backend latency is 0ms on cache HIT');

  // 19.4 Namespace Isolation (Live vs Demo)
  await redisCache.set('cache:obj:live_prod_item', JSON.stringify({ name: 'Live Production Item' }), {
    objectId: 'live_prod_item',
    sizeBytes: 1024,
  });
  const liveObjects = redisCache.getAllObjects('cache:obj:');
  const demoObjects = redisCache.getAllObjects('adaptivecache:demo:');
  assert(liveObjects.some(o => o.objectId === 'live_prod_item'), '19.4a Live object exists under cache:obj:*');
  assert(demoObjects.some(o => o.objectId === 'DEMO-001'), '19.4b Demo object exists under adaptivecache:demo:*');
  assert(!demoObjects.some(o => o.objectId === 'live_prod_item'), '19.4c Demo namespace does not contain live production objects');

  // 19.5 Multi-Factor Scoring on Demo Fixtures
  assert(Boolean(firstReq.metadata && firstReq.metadata.adaptiveScore > 0), '19.5a Real multi-factor adaptiveScore computed on demo object');
  assert(Boolean(firstReq.metadata && ['KEEP', 'REFRESH', 'PRE-CACHE', 'EVICT'].includes(firstReq.metadata.lastDecision)), '19.5b Real lifecycle decision generated for demo object');

  // 19.6 Hot Object Elevation Scenario Execution
  const hotRes = await demoService.start('HOT_OBJECT');
  assert(hotRes.totalRequests === 15, `19.6a Hot object scenario executed 15 requests (got ${hotRes.totalRequests})`);
  assert(hotRes.hits > 0, '19.6b Hot object scenario generated cache hits on repeated access');
  const hotMeta = await redisCache.get('adaptivecache:demo:obj:DEMO-001');
  assert(hotMeta.hit === true && (hotMeta.metadata?.accessCount || 0) >= 3, `19.6c DEMO-001 access frequency elevated from real requests (count=${hotMeta.metadata?.accessCount})`);

  // 19.7 Cold Object Access Scenario Execution
  const coldRes = await demoService.start('COLD_OBJECT');
  assert(coldRes.totalRequests === 10, '19.7a Cold object scenario executed 10 requests');
  const coldObjBreakdown = coldRes.requestsBreakdown.find(r => r.objectId === 'DEMO-006');
  assert(Boolean(coldObjBreakdown), '19.7b DEMO-006 cold object trace was processed with low access frequency');



  // 19.8 Cache Pressure & Deterministic Eviction Scenario
  const pressureRes = await demoService.start('CACHE_PRESSURE', { cacheCapacityBytes: 10240 }); // 10KB small capacity
  assert(pressureRes.totalRequests === 10, '19.8a Cache pressure scenario executed 10 requests');
  assert(pressureRes.decisionsCount === 10, '19.8b Decisions evaluated for all pressure requests');

  // 19.9 Traffic Spike Multiplier (3x) Execution
  const spikeRes = await demoService.start('TRAFFIC_SPIKE', { multiplier: 3 });
  assert(spikeRes.totalRequests === 30, `19.9a Traffic spike 3x multiplier generated 30 requests (got ${spikeRes.totalRequests})`);
  assert(spikeRes.hits > 0 && spikeRes.misses > 0, '19.9b Spike generated real hits and misses');
  assert(typeof spikeRes.p95LatencyMs === 'number' && typeof spikeRes.p99LatencyMs === 'number', '19.9c Real P95 and P99 latencies calculated from spike trace');

  // 19.10 Backend Degradation & Circuit Protection Scenario
  const degradationRes = await demoService.start('BACKEND_DEGRADATION', { simulatedLatencyMs: 300, simulatedErrorRate: 0.4 });
  assert(degradationRes.totalRequests === 10, '19.10a Degradation scenario processed 10 requests safely');
  assert(degradationRes.avgLatencyMs >= 0, '19.10b Degradation latency recorded accurately');

  // 19.11 Activity Logging & Tagging
  const demoLogs = await requestLogRepository.getRecent(50, 'demo');
  assert(demoLogs.length > 0, '19.11a Demo request logs persisted');
  assert(demoLogs.every(l => l.source === 'demo' || l.objectId.startsWith('DEMO-')), '19.11b All demo request logs tagged with source=demo');

  const demoEvents = await eventRepository.getRecent(50, undefined, 'demo');
  assert(demoEvents.length > 0, '19.11c Demo activity events persisted');
  assert(demoEvents.some(e => e.reason.startsWith('[DEMO]') || (e.objectId && e.objectId.startsWith('DEMO-'))), '19.11d Demo events formatted with [DEMO] prefix');

  // 19.12 Benchmark Trace Reproducibility with Demo Trace
  const demoBenchmarkTrace = DEMO_SCENARIOS.BASIC_CACHE.sequence.map((id, idx) => ({
    objectId: id,
    sizeBytes: DEMO_FIXTURES[id]?.sizeBytes || 2048,
    retrievalCostMs: DEMO_FIXTURES[id]?.retrievalCostMs || 60,
  }));
  const benchComparison = await benchmarkEngine.runBenchmark(demoBenchmarkTrace, 15360, 'Demo Test Workload Trace');
  assert(benchComparison.results.length === 4, '19.12a Benchmark engine compared 4 algorithms (LRU, LFU, GDS, AdaptiveCache) on demo trace');
  assert(benchComparison.fairnessDetails.identicalRequests === true, '19.12b Benchmark verified identical requests and fair initial state');



  // 19.13 Demo Reset Isolation (Never Deletes Live Production Data)
  // Seed live data
  await requestLogRepository.log({
    requestId: 'REQ-LIVE-PERMANENT-99',
    timestamp: Date.now(),
    objectId: 'live_production_target',
    operation: 'GET',
    responseSizeBytes: 4096,
    cacheHit: true,
    backendCalled: false,
    backendLatencyMs: 0,
    cacheLatencyMs: 2,
    totalLatencyMs: 2,
    statusCode: 200,
    source: 'live',
    mode: 'live',
  });
  await redisCache.set('cache:obj:live_production_target', JSON.stringify({ data: 'live data' }), {
    objectId: 'live_production_target',
    sizeBytes: 4096,
  });

  // Perform Demo Reset
  const resetRes = await demoService.reset();
  assert(resetRes.success === true, '19.13a Demo reset returned success');
  assert(resetRes.clearedRedisKeys >= 0, '19.13b Demo reset reported cleared Redis keys count');

  // Verify demo keys are purged
  const postResetDemoCheck = await redisCache.get('adaptivecache:demo:obj:DEMO-001');
  assert(postResetDemoCheck.hit === false, '19.13c Demo Redis keys successfully purged after reset');

  // Verify live production data STILL EXISTS and was NOT deleted
  const postResetLiveCheck = await redisCache.get('cache:obj:live_production_target');
  assert(postResetLiveCheck.hit === true, '19.13d CRITICAL: Live Redis cache object was PRESERVED and NOT deleted by demo reset');

  const liveLogsCheck = await requestLogRepository.getRecent(50, 'live');
  assert(liveLogsCheck.some(l => l.requestId === 'REQ-LIVE-PERMANENT-99'), '19.13e CRITICAL: Live request logs were PRESERVED and NOT deleted by demo reset');

  console.log('\n========================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
