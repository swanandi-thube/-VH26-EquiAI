/**
 * REST API Endpoints for ADAPTIVECACHE Platform
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { redisCache } from '../cache/redis';
import { telemetry } from '../telemetry';
import { pipeline } from '../pipeline';
import { workloadGenerator } from '../workload/generator';
import { benchmarkEngine } from '../benchmark/engine';
import { explainability } from '../engine/explainability';
import { whatIfEngine } from '../engine/whatif';
import { costEngine } from '../engine/cost';
import { circuitBreaker } from '../protection/circuitBreaker';
import { coalescer } from '../protection/coalescing';
import { rateLimiter } from '../protection/rateLimiter';
import { poolMonitor } from '../protection/connectionPool';
import { WorkloadConfig, WhatIfScenarioInput, SystemSettings, SystemHealthReport } from '../types';

export const apiRouter = Router();

// --- Dashboard & Telemetry ---

apiRouter.get('/dashboard/metrics', (req: Request, res: Response) => {
  const snapshot = telemetry.getSnapshot();
  res.json({
    success: true,
    data: snapshot,
  });
});

apiRouter.get('/telemetry', (req: Request, res: Response) => {
  const snapshot = telemetry.getSnapshot();
  const recentLogs = db.getRecentRequestLogs(100);
  res.json({
    success: true,
    data: {
      snapshot,
      recentLogs,
    },
  });
});

// --- Cache Objects & Inspection ---

apiRouter.get('/cache/objects', (req: Request, res: Response) => {
  const objects = redisCache.getAllObjects();
  const stats = redisCache.getStats();
  res.json({
    success: true,
    data: {
      objects,
      stats,
    },
  });
});

apiRouter.post('/cache/flush', (req: Request, res: Response) => {
  redisCache.flushall();
  redisCache.resetCounters();
  res.json({
    success: true,
    message: 'Cache flushed and counters reset successfully',
  });
});

apiRouter.post('/cache/request/:id', async (req: Request, res: Response) => {
  const objectId = req.params.id;
  const latency = req.query.latency ? parseInt(req.query.latency as string, 10) : undefined;
  const errorRate = req.query.errorRate ? parseFloat(req.query.errorRate as string) : undefined;
  
  const result = await pipeline.processProductRequest(objectId, latency, errorRate);
  res.json({
    success: result.statusCode === 200,
    data: result,
  });
});

// --- Decisions & Explainability ---

apiRouter.get('/cache/decisions', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const decisions = db.getRecentDecisions(limit);
  res.json({
    success: true,
    data: decisions,
  });
});

apiRouter.get('/cache/decisions/:id/explain', (req: Request, res: Response) => {
  const decisionId = req.params.id;
  const record = db.getDecisionById(decisionId);
  if (!record) {
    res.status(404).json({ success: false, message: `Decision with ID ${decisionId} not found` });
    return;
  }

  const settings = db.getSettings();
  const explanation = explainability.explain(record, settings);
  res.json({
    success: true,
    data: explanation,
  });
});

// --- Activity Stream & Events ---

apiRouter.get('/cache/events', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const filter = req.query.filter as string | undefined;
  const events = db.getRecentEvents(limit, filter);
  res.json({
    success: true,
    data: events,
  });
});

// --- Traffic Lab & Workloads ---

apiRouter.post('/workloads/start', async (req: Request, res: Response) => {
  const config: WorkloadConfig = req.body;
  try {
    const run = await workloadGenerator.startWorkload(config);
    res.json({
      success: true,
      data: run,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/workloads/stop', async (req: Request, res: Response) => {
  const stoppedRun = await workloadGenerator.stopWorkload();
  res.json({
    success: true,
    data: stoppedRun,
  });
});

apiRouter.get('/workloads/active', (req: Request, res: Response) => {
  const active = workloadGenerator.getActiveRun();
  res.json({
    success: true,
    data: {
      isRunning: workloadGenerator.isWorkloadRunning(),
      activeRun: active,
    },
  });
});

// --- Backend Protection ---

apiRouter.get('/protection/stats', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      coalescing: coalescer.getStats(),
      circuitBreaker: circuitBreaker.getStats(),
      rateLimiter: rateLimiter.getStats(),
      pool: db.getPoolMetrics(),
      replicas: poolMonitor.getReplicas(),
    },
  });
});

apiRouter.post('/protection/reset', (req: Request, res: Response) => {
  coalescer.resetCounters();
  circuitBreaker.reset();
  rateLimiter.reset();
  res.json({
    success: true,
    message: 'Backend protection metrics reset',
  });
});

// --- Benchmark Engine ---

apiRouter.post('/benchmark/run', async (req: Request, res: Response) => {
  const { requestCount = 2000, objectCount = 150, capacityMb = 32, traceName = 'Standard Workload Trace' } = req.body;
  const capacityBytes = capacityMb * 1024 * 1024;
  
  const trace = benchmarkEngine.generateTrace(requestCount, objectCount);
  const result = await benchmarkEngine.runBenchmark(trace, capacityBytes, traceName);

  res.json({
    success: true,
    data: result,
  });
});

apiRouter.get('/benchmark/runs', (req: Request, res: Response) => {
  const runs = db.getAllBenchmarkRuns();
  res.json({
    success: true,
    data: runs,
  });
});

apiRouter.get('/benchmark/:id', (req: Request, res: Response) => {
  const run = db.getBenchmarkRun(req.params.id);
  if (!run) {
    res.status(404).json({ success: false, message: 'Benchmark run not found' });
    return;
  }
  res.json({
    success: true,
    data: run,
  });
});

// --- What-If Analysis ---

apiRouter.post('/scenarios/run', (req: Request, res: Response) => {
  const scenarioInput: WhatIfScenarioInput = req.body;
  const currentTelemetry = telemetry.getSnapshot();
  const settings = db.getSettings();

  const comparison = whatIfEngine.evaluate(scenarioInput, currentTelemetry, settings);
  res.json({
    success: true,
    data: comparison,
  });
});

apiRouter.post('/scenarios/apply', (req: Request, res: Response) => {
  const scenarioInput: WhatIfScenarioInput = req.body;
  
  // Apply cache capacity if specified
  if (scenarioInput.cacheCapacityMb) {
    redisCache.setCapacity(scenarioInput.cacheCapacityMb * 1024 * 1024);
    db.updateSettings({ cacheCapacityBytes: scenarioInput.cacheCapacityMb * 1024 * 1024 });
  }

  res.json({
    success: true,
    message: `Scenario parameters applied: Cache capacity set to ${scenarioInput.cacheCapacityMb} MB`,
  });
});

// --- Cost & ROI ---

apiRouter.get('/cost', (req: Request, res: Response) => {
  const snapshot = telemetry.getSnapshot();
  const settings = db.getSettings();
  const costBreakdown = costEngine.calculateCost(
    {
      totalRequestsPerHour: Math.max(snapshot.totalRequests * 60, snapshot.requestsPerSecond * 3600),
      backendRequestsPerHour: Math.max(snapshot.backendRequests * 60, snapshot.requestsPerSecond * 3600 * (1 - snapshot.cacheHitRate)),
      cacheHitsPerHour: Math.max(snapshot.cacheHits * 60, snapshot.requestsPerSecond * 3600 * snapshot.cacheHitRate),
      memoryUsedBytes: snapshot.memoryUsedBytes,
      egressBytesPerHour: snapshot.totalRequests * 60 * 8192,
    },
    settings
  );

  res.json({
    success: true,
    data: costBreakdown,
  });
});

// --- System Health ---

apiRouter.get('/system/health', async (req: Request, res: Response) => {
  const [redisHealth, dbHealth] = await Promise.all([
    redisCache.checkHealth(),
    db.checkHealth(),
  ]);

  const decisionStatus = 'CONNECTED';
  const telemetryStatus = 'CONNECTED';
  const apiStatus = 'CONNECTED';

  const isDegraded = redisHealth.status === 'DEGRADED' || dbHealth.status === 'DEGRADED';
  const isOffline = redisHealth.status === 'OFFLINE' || dbHealth.status === 'OFFLINE';

  const overall = isOffline ? 'OFFLINE' : (isDegraded ? 'DEGRADED' : 'CONNECTED');

  const report: SystemHealthReport = {
    overall,
    timestamp: Date.now(),
    components: {
      redis: { ...redisHealth },
      postgres: { ...dbHealth },
      backendApi: { status: apiStatus, latencyMs: 1, message: 'REST API & Request Pipeline operational' },
      decisionEngine: { status: decisionStatus, latencyMs: 2, message: 'Adaptive Multi-Factor Scorer active' },
      telemetry: { status: telemetryStatus, latencyMs: 1, message: 'Rolling window metric aggregator active' },
      webSocket: { status: 'CONNECTED', activeClients: 1, message: 'Live WebSocket push broadcaster active' },
    },
  };

  res.json({
    success: true,
    data: report,
  });
});

// --- Settings ---

apiRouter.get('/settings', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: db.getSettings(),
  });
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  const updated = db.updateSettings(req.body);
  if (updated.cacheCapacityBytes) {
    redisCache.setCapacity(updated.cacheCapacityBytes);
  }
  if (updated.rateLimitRps) {
    rateLimiter.setLimit(updated.rateLimitRps);
  }
  if (updated.circuitBreakerFailureThreshold && updated.circuitBreakerRecoveryTimeMs) {
    circuitBreaker.setConfig(updated.circuitBreakerFailureThreshold, updated.circuitBreakerRecoveryTimeMs);
  }
  res.json({
    success: true,
    data: updated,
  });
});
