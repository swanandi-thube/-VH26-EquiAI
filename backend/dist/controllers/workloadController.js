"use strict";
/**
 * Workload & Traffic Lab Controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workloadController = exports.WorkloadController = void 0;
const generator_1 = require("../workload/generator");
class WorkloadController {
    async startWorkload(req, res) {
        const config = req.body;
        try {
            const run = await generator_1.workloadGenerator.startWorkload(config);
            res.json({
                success: true,
                data: run,
            });
        }
        catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
    async stopWorkload(req, res) {
        const stoppedRun = await generator_1.workloadGenerator.stopWorkload();
        res.json({
            success: true,
            data: stoppedRun,
        });
    }
    async getActiveWorkload(req, res) {
        const active = generator_1.workloadGenerator.getActiveRun();
        res.json({
            success: true,
            data: {
                isRunning: generator_1.workloadGenerator.isWorkloadRunning(),
                activeRun: active,
            },
        });
    }
}
exports.WorkloadController = WorkloadController;
exports.workloadController = new WorkloadController();
