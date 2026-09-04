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

// --- Dashboard & Telemetry ---
apiRouter.get('/dashboard/metrics', (req: Request, res: Response) => {
  const snapshot = telemetry.getSnapshot();
  res.json({
    success: true,
    data: snapshot,
  });
});

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

// --- Cache Objects & Inspection ---
apiRouter.get('/cache/objects', (req: Request, res: Response) => cacheController.getCacheObjects(req, res));
apiRouter.post('/cache/flush', (req: Request, res: Response) => cacheController.flushCache(req, res));
apiRouter.post('/cache/request/:id', (req: Request, res: Response) => cacheController.executeRequest(req, res));

// --- Decisions & Explainability ---
apiRouter.get('/cache/decisions', (req: Request, res: Response) => cacheController.getDecisions(req, res));
apiRouter.get('/cache/decisions/:id/explain', (req: Request, res: Response) => cacheController.getDecisionExplanation(req, res));

// --- Time-Series Observations & Change Detection (Phase 5) ---
apiRouter.post('/observations/record', (req: Request, res: Response) => observationController.recordObservation(req, res));
apiRouter.get('/observations', (req: Request, res: Response) => observationController.getAllObservations(req, res));
apiRouter.get('/observations/:objectId', (req: Request, res: Response) => observationController.getObjectObservations(req, res));
apiRouter.get('/observations/:objectId/changes', (req: Request, res: Response) => observationController.getObjectChanges(req, res));

// --- Activity Stream & Audit Events ---
apiRouter.get('/cache/events', (req: Request, res: Response) => cacheController.getEvents(req, res));

// --- Traffic Lab & Workload Ingestion ---
apiRouter.post('/workloads/upload', upload.single('file'), (req: Request, res: Response) => workloadController.uploadWorkload(req, res));
apiRouter.get('/workloads', (req: Request, res: Response) => workloadController.getWorkloadRuns(req, res));
apiRouter.get('/workloads/:id', (req: Request, res: Response) => workloadController.getWorkloadRunById(req, res));
apiRouter.delete('/workloads/:id', (req: Request, res: Response) => workloadController.deleteWorkloadRun(req, res));
apiRouter.post('/workloads/start', (req: Request, res: Response) => workloadController.startWorkload(req, res));
apiRouter.post('/workloads/stop', (req: Request, res: Response) => workloadController.stopWorkload(req, res));
apiRouter.get('/workloads/active', (req: Request, res: Response) => workloadController.getActiveWorkload(req, res));

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

// --- System Configuration & Policies ---
apiRouter.get('/settings', (req: Request, res: Response) => settingsController.getSettings(req, res));
apiRouter.put('/settings', (req: Request, res: Response) => settingsController.updateSettings(req, res));
