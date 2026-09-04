"use strict";
/**
 * Benchmark API Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.benchmarkController = exports.BenchmarkController = void 0;
const engine_1 = require("../benchmark/engine");
const db_1 = require("../db");
class BenchmarkController {
    async runBenchmark(req, res) {
        const { requestCount = 2000, objectCount = 150, capacityMb = 32, traceName = 'Standard Workload Trace' } = req.body;
        const capacityBytes = capacityMb * 1024 * 1024;
        const trace = engine_1.benchmarkEngine.generateTrace(requestCount, objectCount);
        const result = await engine_1.benchmarkEngine.runBenchmark(trace, capacityBytes, traceName);
        res.json({
            success: true,
            data: result,
        });
    }
    async getBenchmarkRuns(req, res) {
        const runs = db_1.db.getAllBenchmarkRuns();
        res.json({
            success: true,
            data: runs,
        });
    }
    async getBenchmarkRunById(req, res) {
        const run = db_1.db.getBenchmarkRun(req.params.id);
        if (!run) {
            res.status(404).json({ success: false, message: 'Benchmark run not found' });
            return;
        }
        res.json({
            success: true,
            data: run,
        });
    }
}
exports.BenchmarkController = BenchmarkController;
exports.benchmarkController = new BenchmarkController();
