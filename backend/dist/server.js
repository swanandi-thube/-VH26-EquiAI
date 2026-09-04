"use strict";
/**
 * ADAPTIVECACHE Backend Server Entry Point
 * Express API + WebSocket Stream + Prometheus Metrics + Database Migrations
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config");
const routes_1 = require("./api/routes");
const server_1 = require("./ws/server");
const telemetry_1 = require("./telemetry");
const migrations_1 = require("./database/migrations");
const client_1 = require("./database/client");
const app = (0, express_1.default)();
const PORT = config_1.config.port;
// Enable CORS and JSON body parser
app.use((0, cors_1.default)({ origin: config_1.config.corsOrigin }));
app.use(express_1.default.json());
// API Routes
app.use('/api', routes_1.apiRouter);
// Prometheus Metrics Scrape Endpoint
app.get('/metrics', async (req, res) => {
    try {
        const metricsData = await telemetry_1.telemetry.getPrometheusMetrics();
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.end(metricsData);
    }
    catch (err) {
        res.status(500).end(err.message);
    }
});
// Serve frontend static assets if dist folder exists
const frontendDistPath = path_1.default.resolve(__dirname, '../../frontend/dist');
if (fs_1.default.existsSync(frontendDistPath)) {
    app.use(express_1.default.static(frontendDistPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/metrics') || req.path.startsWith('/ws')) {
            return next();
        }
        res.sendFile(path_1.default.join(frontendDistPath, 'index.html'));
    });
    console.log(`[Static] Serving frontend from ${frontendDistPath}`);
}
else {
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
const server = http_1.default.createServer(app);
// Attach WebSocket server
server_1.wsService.init(server);
// Run DB migrations and start listening
migrations_1.MigrationRunner.runMigrations().catch((err) => {
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
        await client_1.dbClient.close();
        process.exit(0);
    });
});
