/**
 * REST API Routes for ADAPTIVECACHE Platform
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  healthController,
  cacheController,
  settingsController,
  workloadController,
  benchmarkController,
  whatIfController,
  costController,
  protectionController,
  observationController,
  demoController,
} from '../controllers';
import { telemetry } from '../telemetry';
import { requestLogRepository } from '../repositories';

// Configure multer for memory storage (max 50MB per file)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const apiRouter = Router();

// --- Health Verification ---
apiRouter.get('/health', (req: Request, res: Response) => healthController.getHealth(req, res));
apiRouter.get('/system/health', (req: Request, res: Response) => healthController.getHealth(req, res));
apiRouter.get('/system/db', (req: Request, res: Response) => healthController.getDbStatus(req, res));

// --- Realistic Products Catalog ---
apiRouter.get('/products', (req: Request, res: Response) => cacheController.getProducts(req, res));
apiRouter.get('/products/:objectId', (req: Request, res: Response) => cacheController.getProductById(req, res));

// --- Cache Objects, Decisions & Specific Sub-Routes ---
apiRouter.get('/cache/objects', (req: Request, res: Response) => cacheController.getCacheObjects(req, res));
apiRouter.get('/cache/decisions', (req: Request, res: Response) => cacheController.getDecisions(req, res));
apiRouter.get('/cache/decisions/:id/explain', (req: Request, res: Response) => cacheController.getDecisionExplanation(req, res));
apiRouter.get('/cache/events', (req: Request, res: Response) => cacheController.getEvents(req, res));
apiRouter.post('/cache/request/:id', (req: Request, res: Response) => cacheController.executeRequest(req, res));
apiRouter.post('/cache/invalidate/:objectId', (req: Request, res: Response) => cacheController.invalidateObject(req, res));
apiRouter.post('/cache/flush', (req: Request, res: Response) => cacheController.flushCache(req, res));

// --- Parametric Cache Object Request Flow ---
apiRouter.get('/cache/:objectId', (req: Request, res: Response) => cacheController.executeRequest(req, res));

// --- Dashboard, Metrics & Historical Data ---
apiRouter.get('/metrics', (req: Request, res: Response) => {
  const snapshot = telemetry.getSnapshot();
  res.json({
    success: true,
    data: snapshot,
  });
});

apiRouter.get('/dashboard/metrics', (req: Request, res: Response) => {
  const snapshot = telemetry.getSnapshot();
  res.json({
    success: true,
    data: snapshot,
  });
});

apiRouter.get('/history', (req: Request, res: Response) => cacheController.getHistory(req, res));

apiRouter.get('/telemetry', async (req: Request, res: Response) => {
  const snapshot = telemetry.getSnapshot();
  const recentLogs = await requestLogRepository.getRecent(100);
  res.json({
    success: true,
    data: {
      snapshot,
      recentLogs,
    },
  });
});

// --- Decisions & Activity Aliases ---
apiRouter.get('/decisions', (req: Request, res: Response) => cacheController.getDecisions(req, res));
apiRouter.get('/activity', (req: Request, res: Response) => cacheController.getEvents(req, res));

// --- Time-Series Observations & Change Detection (Phase 5) ---
apiRouter.post('/observations/record', (req: Request, res: Response) => observationController.recordObservation(req, res));
apiRouter.get('/observations', (req: Request, res: Response) => observationController.getAllObservations(req, res));
apiRouter.get('/observations/:objectId', (req: Request, res: Response) => observationController.getObjectObservations(req, res));
apiRouter.get('/observations/:objectId/changes', (req: Request, res: Response) => observationController.getObjectChanges(req, res));

// --- Traffic Lab & Workload Ingestion ---
apiRouter.post('/workloads/upload', upload.single('file'), (req: Request, res: Response) => workloadController.uploadWorkload(req, res));
apiRouter.get('/workloads', (req: Request, res: Response) => workloadController.getWorkloadRuns(req, res));
apiRouter.get('/workloads/:id', (req: Request, res: Response) => workloadController.getWorkloadRunById(req, res));
apiRouter.delete('/workloads/:id', (req: Request, res: Response) => workloadController.deleteWorkloadRun(req, res));
apiRouter.post('/workloads/start', (req: Request, res: Response) => workloadController.startWorkload(req, res));
apiRouter.post('/workload/run', (req: Request, res: Response) => workloadController.startWorkload(req, res));
apiRouter.post('/workloads/stop', (req: Request, res: Response) => workloadController.stopWorkload(req, res));
apiRouter.get('/workloads/active', (req: Request, res: Response) => workloadController.getActiveWorkload(req, res));
apiRouter.post('/workloads/:id/replay', (req: Request, res: Response) => workloadController.replayWorkload(req, res));
apiRouter.post('/workloads/replay/stop', (req: Request, res: Response) => workloadController.stopReplay(req, res));
apiRouter.get('/workloads/replay/status', (req: Request, res: Response) => workloadController.getReplayStatus(req, res));

// --- Backend Protection & Concurrency Defense ---
apiRouter.get('/protection/stats', (req: Request, res: Response) => protectionController.getStats(req, res));
apiRouter.post('/protection/reset', (req: Request, res: Response) => protectionController.resetStats(req, res));

// --- Benchmark Engine ---
apiRouter.post('/benchmark/run', (req: Request, res: Response) => benchmarkController.runBenchmark(req, res));
apiRouter.get('/benchmark/runs', (req: Request, res: Response) => benchmarkController.getBenchmarkRuns(req, res));
apiRouter.get('/benchmark/:id', (req: Request, res: Response) => benchmarkController.getBenchmarkRunById(req, res));

// --- What-If Scenario Counterfactual Analysis ---
apiRouter.post('/scenarios/run', (req: Request, res: Response) => whatIfController.runScenario(req, res));
apiRouter.post('/scenarios/apply', (req: Request, res: Response) => whatIfController.applyScenario(req, res));

// --- Cost & ROI Infrastructure Model ---
apiRouter.get('/cost', (req: Request, res: Response) => costController.getCost(req, res));

// --- Demo Mode & Test Harness Isolation ---
apiRouter.post('/demo/start', (req: Request, res: Response) => demoController.start(req, res));
apiRouter.post('/demo/stop', (req: Request, res: Response) => demoController.stop(req, res));
apiRouter.post('/demo/reset', (req: Request, res: Response) => demoController.reset(req, res));
apiRouter.get('/demo/status', (req: Request, res: Response) => demoController.getStatus(req, res));
apiRouter.get('/demo/scenarios', (req: Request, res: Response) => demoController.getScenarios(req, res));

// --- System Configuration & Policies ---
apiRouter.get('/settings', (req: Request, res: Response) => settingsController.getSettings(req, res));
apiRouter.put('/settings', (req: Request, res: Response) => settingsController.updateSettings(req, res));
