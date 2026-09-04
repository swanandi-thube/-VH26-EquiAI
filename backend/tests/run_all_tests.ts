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
  redisCache.flushall();
  redisCache.setCapacity(10000); // 10 KB small capacity
  await redisCache.set('product:1', JSON.stringify({ name: 'Test 1' }), { objectId: '1', sizeBytes: 4000, retrievalCostMs: 50 }, 10);
  const get1 = await redisCache.get('product:1');
  assert(get1.hit === true, 'Cache SET and GET hit verified');
  assert(redisCache.ttl('product:1') > 0, 'TTL correctly returned for active key');

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

  console.log('\n========================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
