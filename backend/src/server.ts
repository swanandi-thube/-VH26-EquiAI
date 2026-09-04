/**
 * ADAPTIVECACHE Backend Server Entry Point
 * Express API + WebSocket Stream + Prometheus Metrics
 */

import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { apiRouter } from './api/routes';
import { wsService } from './ws/server';
import { telemetry } from './telemetry';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Enable CORS and JSON body parser
app.use(cors({ origin: '*' }));
app.use(express.json());

// API Routes
app.use('/api', apiRouter);

// Prometheus Metrics Scrape Endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metricsData = await telemetry.getPrometheusMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(metricsData);
  } catch (err: any) {
    res.status(500).end(err.message);
  }
});

// Root ping
app.get('/', (req, res) => {
  res.json({
    name: 'ADAPTIVECACHE API',
    status: 'OPERATIONAL',
    version: '2.0.0',
    endpoints: {
      metrics: '/api/dashboard/metrics',
      objects: '/api/cache/objects',
      decisions: '/api/cache/decisions',
      workloads: '/api/workloads/start',
      benchmarks: '/api/benchmark/run',
      prometheus: '/metrics',
      websocket: '/ws',
    }
  });
});

const server = http.createServer(app);

// Attach WebSocket server
wsService.init(server);

server.listen(PORT, () => {
  console.log('================================================================');
  console.log('  ADAPTIVECACHE - Intelligent Caching & Backend Protection Platform');
  console.log('================================================================');
  console.log(`  ✓ REST API Server:   http://localhost:${PORT}/api`);
  console.log(`  ✓ WebSocket Stream:  ws://localhost:${PORT}/ws`);
  console.log(`  ✓ Prometheus Metric: http://localhost:${PORT}/metrics`);
  console.log('================================================================');
});
