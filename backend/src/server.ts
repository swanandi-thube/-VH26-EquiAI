/**
 * ADAPTIVECACHE Backend Server Entry Point
 * Express API + WebSocket Stream + Prometheus Metrics + Database Migrations
 */

import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { apiRouter } from './api/routes';
import { wsService } from './ws/server';
import { telemetry } from './telemetry';
import { MigrationRunner } from './database/migrations';
import { dbClient } from './database/client';

const app = express();
const PORT = config.port;

// Enable CORS and JSON body parser
app.use(cors({ origin: config.corsOrigin }));
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

// Serve frontend static assets if dist folder exists
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/metrics') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
  console.log(`[Static] Serving frontend from ${frontendDistPath}`);
} else {
  app.get('/', (req, res) => {
    res.json({
      name: 'ADAPTIVECACHE API',
      status: 'OPERATIONAL',
      version: '2.0.0',
      endpoints: {
        health: '/api/system/health',
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
}

const server = http.createServer(app);

// Attach WebSocket server
wsService.init(server);

// Run DB migrations and start listening
MigrationRunner.runMigrations().catch((err) => {
  console.warn('[Startup] Migration initialization note:', err.message);
});

server.listen(PORT, () => {
  console.log('================================================================');
  console.log('  ADAPTIVECACHE - Intelligent Caching & Backend Protection Platform');
  console.log('================================================================');
  console.log(`  ✓ Dashboard UI & REST API: http://localhost:${PORT}/`);
  console.log(`  ✓ Health API Endpoint:     http://localhost:${PORT}/api/system/health`);
  console.log(`  ✓ WebSocket Stream:        ws://localhost:${PORT}/ws`);
  console.log(`  ✓ Prometheus Metrics:      http://localhost:${PORT}/metrics`);
  console.log('================================================================');
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received. Closing HTTP server and database pool...');
  server.close(async () => {
    await dbClient.close();
    process.exit(0);
  });
});
