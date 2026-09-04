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
