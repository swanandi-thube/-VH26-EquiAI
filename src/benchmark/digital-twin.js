/**
 * Digital Twin Benchmark Runner
 * Executes synchronous benchmark tests feeding identical request streams into Smart Cache, LRU, LFU, and GDS.
 */

import { SmartCache } from '../cache/smart-cache.js';
import { LRUCache } from '../cache/lru-cache.js';
import { LFUCache } from '../cache/lfu-cache.js';
import { GDSCache } from '../cache/gds-cache.js';
import { DatabaseSimulator } from '../backend/database-sim.js';
import { BackendService } from '../backend/backend-service.js';
import { CostModel } from '../cost/cost-model.js';
import { WorkloadGenerator } from '../workload/generator.js';
import { DEFAULT_CONFIG } from '../core/types.js';

export class DigitalTwinBenchmark {
  constructor() {
    this.costModel = new CostModel();
  }

  runBenchmark(options = {}) {
    const {
      workloadType = 'READ_HEAVY_API',
      scenario = 'STEADY',
      requestCount = 1200,
      cacheCapacityBytes = DEFAULT_CONFIG.cacheCapacityBytes
    } = options;

    // 1. Initialize identical instances
    const strategies = {
      SMART: {
        cache: new SmartCache(cacheCapacityBytes, workloadType),
        db: new DatabaseSimulator(),
        backend: new BackendService(),
        latencies: []
      },
      LRU: {
        cache: new LRUCache(cacheCapacityBytes),
        db: new DatabaseSimulator(),
        backend: new BackendService(),
        latencies: []
      },
      LFU: {
        cache: new LFUCache(cacheCapacityBytes),
        db: new DatabaseSimulator(),
        backend: new BackendService(),
        latencies: []
      },
      GDS: {
        cache: new GDSCache(cacheCapacityBytes),
        db: new DatabaseSimulator(),
        backend: new BackendService(),
        latencies: []
      }
    };

    // 2. Generate deterministic identical request trace
    const generator = new WorkloadGenerator();
    generator.setWorkloadType(workloadType);
    generator.setScenario(scenario);
    generator.setBaseRps(300);

    const requests = [];
    const stepDeltaMs = 50;
    let simTime = 0;

    while (requests.length < requestCount) {
      simTime += stepDeltaMs / 1000;
      const batch = generator.tick(stepDeltaMs);
      for (const req of batch.requests) {
        requests.push({ ...req, timestamp: simTime });
        if (requests.length >= requestCount) break;
      }
    }

    // 3. Replay exact trace across all 4 cache strategies
    for (const req of requests) {
      for (const [stratKey, strat] of Object.entries(strategies)) {
        let res = strat.cache.get(req.id, req.timestamp);
        if (!res.hit) {
          strat.cache.put(req, req.timestamp);
        }

        // Database & Backend response
        const dbResult = strat.db.processMisses(res.hit ? 0 : 1, 50, workloadType);
        const backendResult = strat.backend.processRequestBatch(
          [{ hit: res.hit, item: req }],
          dbResult,
          workloadType
        );
        strat.latencies.push(backendResult.latencies[0]);
      }
    }

    // 4. Compute comprehensive results for each strategy
    const results = {};
    const effectiveRps = 300;

    for (const [key, strat] of Object.entries(strategies)) {
      const sortedLatencies = [...strat.latencies].sort((a, b) => a - b);
      const n = sortedLatencies.length;
      const p50 = sortedLatencies[Math.floor(n * 0.50)] || 2.5;
      const p95 = sortedLatencies[Math.floor(n * 0.95)] || 15.0;
      const p99 = sortedLatencies[Math.floor(n * 0.99)] || 55.0;

      const totalReqs = strat.cache.hits + strat.cache.misses;
      const hitRate = totalReqs > 0 ? (strat.cache.hits / totalReqs) : 0;
      const missRate = 1 - hitRate;

      const dbTelemetry = strat.db.getTelemetry();

      const costTelemetry = {
        cacheCapacityBytes,
        usedBytes: strat.cache.usedBytes,
        hitsPerSecond: effectiveRps * hitRate,
        missesPerSecond: effectiveRps * missRate,
        backendLoadPercent: strat.backend.backendLoadPercent,
        dbQueriesPerSecond: effectiveRps * missRate,
        totalRequestsWindow: totalReqs,
        totalHitsWindow: strat.cache.hits,
        totalMissesWindow: strat.cache.misses
      };

      const costResult = this.costModel.computeCost(costTelemetry);

      results[key] = {
        name: key === 'SMART' ? 'Smart Cache (Adaptive)' : key,
        hitRatePercent: Number((hitRate * 100).toFixed(1)),
        missRatePercent: Number((missRate * 100).toFixed(1)),
        p50LatencyMs: Number(p50.toFixed(1)),
        p95LatencyMs: Number(p95.toFixed(1)),
        p99LatencyMs: Number(p99.toFixed(1)),
        backendLoadPercent: strat.backend.backendLoadPercent,
        dbCpuPercent: dbTelemetry.cpuUtilizationPercent,
        dbLatencyMs: dbTelemetry.currentLatencyMs,
        dbConnections: dbTelemetry.activeConnections,
        evictions: strat.cache.evictions,
        refreshes: strat.cache.refreshes || 0,
        memoryUsedMB: Number((strat.cache.usedBytes / (1024 * 1024)).toFixed(1)),
        costPerHour: costResult.totalCostPerHour,
        costSavingsPerHour: costResult.costSavingsPerHour,
        entriesCount: strat.cache.entries.size
      };
    }

    // Compute Advantage deltas of Smart Cache vs LRU
    const smart = results.SMART;
    const lru = results.LRU;
    const lfu = results.LFU;
    const gds = results.GDS;

    const advantage = {
      hitRateGainVsLru: Number((smart.hitRatePercent - lru.hitRatePercent).toFixed(1)),
      p99LatencyReductionVsLruPercent: Math.round(((lru.p99LatencyMs - smart.p99LatencyMs) / lru.p99LatencyMs) * 100),
      costSavingsGainVsLru: Number((smart.costSavingsPerHour - lru.costSavingsPerHour).toFixed(3)),
      dbCpuReductionVsLru: Number((lru.dbCpuPercent - smart.dbCpuPercent).toFixed(1)),
      summary: `Smart Cache achieved ${smart.hitRatePercent}% hit rate (+${(smart.hitRatePercent - lru.hitRatePercent).toFixed(1)}% vs LRU), reducing P99 latency by ${Math.round(((lru.p99LatencyMs - smart.p99LatencyMs) / lru.p99LatencyMs) * 100)}% and saving $${smart.costSavingsPerHour.toFixed(3)}/hr in infrastructure costs.`
    };

    return {
      workloadType,
      scenario,
      requestCount,
      timestamp: new Date().toLocaleTimeString(),
      strategies: results,
      advantage
    };
  }
}
