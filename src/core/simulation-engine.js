/**
 * Central Simulation Engine
 * Master clock and state coordinator uniting Workload, Smart Cache, DB, Latencies, Costs, Scaling, and Telemetry.
 */

import { WORKLOAD_TYPES, TRAFFIC_SCENARIOS, CACHE_STRATEGIES, DEFAULT_CONFIG } from './types.js';
import { globalEventBus } from './event-bus.js';
import { ItemCatalog } from '../workload/item-catalog.js';
import { WorkloadGenerator } from '../workload/generator.js';
import { SmartCache } from '../cache/smart-cache.js';
import { LRUCache } from '../cache/lru-cache.js';
import { LFUCache } from '../cache/lfu-cache.js';
import { GDSCache } from '../cache/gds-cache.js';
import { DatabaseSimulator } from '../backend/database-sim.js';
import { BackendService } from '../backend/backend-service.js';
import { CostModel } from '../cost/cost-model.js';
import { ScalingAdvisor } from '../scaling/scaling-advisor.js';
import { MetricsEngine } from '../metrics/metrics-engine.js';
import { HistoryRecorder } from '../timemachine/history-recorder.js';

export class SimulationEngine {
  constructor() {
    this.catalog = new ItemCatalog();
    this.workloadGenerator = new WorkloadGenerator(this.catalog);
    
    this.activeStrategy = CACHE_STRATEGIES.SMART;
    this.cacheCapacityBytes = DEFAULT_CONFIG.cacheCapacityBytes;
    
    // Cache Strategy Instances
    this.smartCache = new SmartCache(this.cacheCapacityBytes, WORKLOAD_TYPES.READ_HEAVY_API);
    this.lruCache = new LRUCache(this.cacheCapacityBytes);
    this.lfuCache = new LFUCache(this.cacheCapacityBytes);
    this.gdsCache = new GDSCache(this.cacheCapacityBytes);

    // Backend & Infrastructure Simulators
    this.dbSimulator = new DatabaseSimulator();
    this.backendService = new BackendService();
    this.costModel = new CostModel();
    this.scalingAdvisor = new ScalingAdvisor();
    this.metricsEngine = new MetricsEngine();
    this.historyRecorder = new HistoryRecorder();

    // Simulation Execution State
    this.isRunning = true;
    this.tickIntervalMs = DEFAULT_CONFIG.tickIntervalMs;
    this.timerId = null;
    this.currentSimTime = 0;
    this.lastTickTimestamp = Date.now();

    // Warm-up initial items so the dashboard starts with realistic cached data
    this.seedWarmCache();
  }

  seedWarmCache() {
    const items = this.catalog.getCatalog(this.workloadGenerator.workloadType);
    for (let i = 0; i < Math.min(35, items.length); i++) {
      const item = items[i];
      this.smartCache.put(item, 0);
      this.lruCache.put(item, 0);
      this.lfuCache.put(item, 0);
      this.gdsCache.put(item, 0);
    }
  }

  start() {
    if (this.isRunning && this.timerId) return;
    this.isRunning = true;
    this.lastTickTimestamp = Date.now();
    this.timerId = setInterval(() => this.tick(), this.tickIntervalMs);
    globalEventBus.emit('simulation_status', { isRunning: true });
  }

  pause() {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    globalEventBus.emit('simulation_status', { isRunning: false });
  }

  step() {
    if (!this.isRunning) {
      this.tick();
    }
  }

  reset() {
    this.pause();
    this.currentSimTime = 0;
    this.smartCache.clear();
    this.lruCache.clear();
    this.lfuCache.clear();
    this.gdsCache.clear();
    this.dbSimulator.reset();
    this.backendService.reset();
    this.metricsEngine.reset();
    this.historyRecorder.reset();
    this.seedWarmCache();
    this.tick();
    globalEventBus.emit('simulation_reset', {});
  }

  setWorkloadType(type) {
    this.workloadGenerator.setWorkloadType(type);
    this.smartCache.setWorkloadType(type);
    globalEventBus.emit('decision_feed_event', {
      type: 'WORKLOAD_SWITCH',
      title: `Switched Workload to ${type === WORKLOAD_TYPES.READ_HEAVY_API ? 'Read-Heavy API' : 'Compute-Heavy Recommendation'}`,
      description: `Adapted multi-factor weights and recomputation latency models.`,
      severity: 'info',
      timestamp: this.currentSimTime
    });
    this.tick();
  }

  setScenario(scenario, options = {}) {
    this.workloadGenerator.setScenario(scenario, options);
    
    let scenarioDesc = `Traffic pattern switched to ${scenario}`;
    if (scenario === TRAFFIC_SCENARIOS.POPULARITY_SPIKE) {
      scenarioDesc = `Popularity surge triggered on ${this.workloadGenerator.spikeTargetItemId} (+4500% request share).`;
    } else if (scenario === TRAFFIC_SCENARIOS.COLD_START) {
      this.smartCache.clear();
      this.lruCache.clear();
      this.lfuCache.clear();
      this.gdsCache.clear();
      scenarioDesc = `Cache wiped. Cold start initiated under full incoming traffic.`;
    } else if (scenario === TRAFFIC_SCENARIOS.CACHE_POLLUTION) {
      scenarioDesc = `Unique key deluge injected. Testing Cache Pollution Defense.`;
    } else if (scenario === TRAFFIC_SCENARIOS.TRAFFIC_BURST) {
      scenarioDesc = `Traffic volume surge: 3.8x baseline request burst.`;
    }

    globalEventBus.emit('decision_feed_event', {
      type: 'SCENARIO_CHANGE',
      title: `Scenario: ${scenario.replace('_', ' ')}`,
      description: scenarioDesc,
      severity: scenario === TRAFFIC_SCENARIOS.CACHE_POLLUTION ? 'warning' : 'success',
      timestamp: this.currentSimTime
    });

    this.tick();
  }

  setBaseRps(rps) {
    this.workloadGenerator.setBaseRps(rps);
    this.tick();
  }

  setSpeedMultiplier(speed) {
    this.workloadGenerator.setSpeedMultiplier(speed);
  }

  setCapacity(newCapacityBytes) {
    this.cacheCapacityBytes = newCapacityBytes;
    this.smartCache.setCapacity(newCapacityBytes);
    this.lruCache.setCapacity(newCapacityBytes);
    this.lfuCache.setCapacity(newCapacityBytes);
    this.gdsCache.setCapacity(newCapacityBytes);

    globalEventBus.emit('decision_feed_event', {
      type: 'CAPACITY_CHANGE',
      title: `Cache Capacity Resized to ${(newCapacityBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`,
      description: `Eviction thresholds and memory allocation recalculated.`,
      severity: 'info',
      timestamp: this.currentSimTime
    });

    this.tick();
  }

  /**
   * Main Simulation Step
   */
  tick() {
    const deltaMs = this.tickIntervalMs;
    
    // 1. Generate Request Batch
    const batch = this.workloadGenerator.tick(deltaMs);
    this.currentSimTime = batch.simTimeSeconds;
    const { requests, effectiveRps, workloadType } = batch;

    // 2. Process requests through Smart Cache and shadow stores
    const batchResults = [];
    let tickHits = 0;
    let tickMisses = 0;

    for (const req of requests) {
      // Primary Smart Cache evaluation
      let getRes = this.smartCache.get(req.id, this.currentSimTime);
      if (!getRes.hit) {
        this.smartCache.put(req, this.currentSimTime);
        tickMisses++;
      } else {
        tickHits++;
      }
      batchResults.push({ hit: getRes.hit, item: req });

      // Shadow runs for LRU, LFU, GDS
      let lruRes = this.lruCache.get(req.id, this.currentSimTime);
      if (!lruRes.hit) this.lruCache.put(req, this.currentSimTime);

      let lfuRes = this.lfuCache.get(req.id, this.currentSimTime);
      if (!lfuRes.hit) this.lfuCache.put(req, this.currentSimTime);

      let gdsRes = this.gdsCache.get(req.id, this.currentSimTime);
      if (!gdsRes.hit) this.gdsCache.put(req, this.currentSimTime);
    }

    // 3. Database Simulation
    const dbTelemetry = this.dbSimulator.processMisses(tickMisses, deltaMs, workloadType);

    // 4. Backend Service Simulation & Latency generation
    const backendResult = this.backendService.processRequestBatch(batchResults, dbTelemetry, workloadType);
    this.metricsEngine.addLatencySamples(backendResult.latencies);

    // 5. Periodic Smart Cache Maintenance
    this.smartCache.periodicMaintenance(this.currentSimTime, requests.length);

    // 6. Compute Telemetry & Percentiles
    const percentiles = this.metricsEngine.computePercentiles();
    const hitRate = this.smartCache.getHitRate();
    const missRate = 1 - hitRate;

    const costTelemetry = {
      cacheCapacityBytes: this.cacheCapacityBytes,
      usedBytes: this.smartCache.usedBytes,
      hitsPerSecond: effectiveRps * hitRate,
      missesPerSecond: effectiveRps * missRate,
      backendLoadPercent: backendResult.backendLoadPercent,
      dbQueriesPerSecond: effectiveRps * missRate,
      totalRequestsWindow: this.smartCache.hits + this.smartCache.misses,
      totalHitsWindow: this.smartCache.hits,
      totalMissesWindow: this.smartCache.misses
    };

    const costResult = this.costModel.computeCost(costTelemetry);
    const scalingResult = this.scalingAdvisor.evaluateScaling(
      this.cacheCapacityBytes,
      {
        hitsPerSecond: costTelemetry.hitsPerSecond,
        missesPerSecond: costTelemetry.missesPerSecond,
        hitRate,
        backendLoadPercent: backendResult.backendLoadPercent,
        memoryUsagePercent: this.smartCache.getUsagePercent()
      }
    );

    const pollutionStatus = this.smartCache.pollutionGuard.getStatus();

    const snapshot = {
      simTime: Math.round(this.currentSimTime),
      trafficRps: effectiveRps,
      hitRatePercent: Number((hitRate * 100).toFixed(1)),
      missRatePercent: Number((missRate * 100).toFixed(1)),
      p50: percentiles.p50,
      p95: percentiles.p95,
      p99: percentiles.p99,
      avgLatency: percentiles.avg,
      costPerHour: costResult.totalCostPerHour,
      costSavingsPerHour: costResult.costSavingsPerHour,
      savingsPercentage: costResult.savingsPercentage,
      uncachedCostPerHour: costResult.uncachedTotalCostPerHour,
      cacheCostPerHour: costResult.cacheCostPerHour,
      computeCostPerHour: costResult.computeCostPerHour,
      dbCostPerHour: costResult.dbCostPerHour,
      backendLoadPercent: backendResult.backendLoadPercent,
      activeThreads: backendResult.activeThreads,
      dbCpuPercent: dbTelemetry.cpuUtilizationPercent,
      dbLatencyMs: dbTelemetry.currentLatencyMs,
      dbConnections: dbTelemetry.activeConnections,
      dbQueriesPerSecond: dbTelemetry.queriesPerSecond,
      memoryUsedMB: Number((this.smartCache.usedBytes / (1024 * 1024)).toFixed(1)),
      memoryCapacityMB: Number((this.cacheCapacityBytes / (1024 * 1024)).toFixed(1)),
      memoryUsagePercent: Number(this.smartCache.getUsagePercent().toFixed(1)),
      evictions: this.smartCache.evictions,
      refreshes: this.smartCache.refreshes,
      activeItemsCount: this.smartCache.entries.size,
      workloadType,
      scenario: batch.scenario,
      pollutionRisk: pollutionStatus.riskLevel,
      uniqueKeyRatePercent: pollutionStatus.uniqueKeyRatePercent,
      usefulOccupancyPercent: pollutionStatus.usefulOccupancyPercent,
      scalingDecision: scalingResult
    };

    // Record in metrics history and time machine
    this.metricsEngine.recordSnapshot(snapshot);
    this.historyRecorder.recordState(this.currentSimTime, snapshot);

    // Broadcast update to UI
    globalEventBus.emit('simulation_tick', {
      snapshot,
      smartCache: this.smartCache,
      lruCache: this.lruCache,
      lfuCache: this.lfuCache,
      gdsCache: this.gdsCache,
      scalingResult,
      pollutionStatus
    });
  }
}
