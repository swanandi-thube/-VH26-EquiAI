"use strict";
/**
 * Benchmark API Controller
 * Executes and serves fair reproducible digital-twin benchmarks across caching algorithms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.benchmarkController = exports.BenchmarkController = void 0;
const engine_1 = require("../benchmark/engine");
const repositories_1 = require("../repositories");
class BenchmarkController {
    async runBenchmark(req, res) {
        try {
            const { workloadId, requestCount = 2000, objectCount = 150, capacityMb = 32, traceName = 'Standard Workload Trace', } = req.body;
            const capacityBytes = capacityMb * 1024 * 1024;
            let result;
            if (workloadId) {
                result = await engine_1.benchmarkEngine.runBenchmarkFromWorkload(workloadId, capacityBytes);
            }
            else {
                const trace = engine_1.benchmarkEngine.generateTrace(requestCount, objectCount);
                result = await engine_1.benchmarkEngine.runBenchmark(trace, capacityBytes, traceName);
            }
            res.json({
                success: true,
                data: result,
            });
        }
        catch (err) {
            res.status(400).json({
                success: false,
                message: err.message,
            });
        }
    }
    async getBenchmarkRuns(req, res) {
        try {
            const runs = await repositories_1.benchmarkRepository.getAllRuns();
            res.json({
                success: true,
                data: runs,
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                message: err.message,
            });
        }
    }
    async getBenchmarkRunById(req, res) {
        try {
            const run = await repositories_1.benchmarkRepository.getRunById(req.params.id);
            if (!run) {
                res.status(404).json({ success: false, message: 'Benchmark run not found' });
                return;
            }
            res.json({
                success: true,
                data: run,
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                message: err.message,
            });
        }
    }
}
exports.BenchmarkController = BenchmarkController;
exports.benchmarkController = new BenchmarkController();
