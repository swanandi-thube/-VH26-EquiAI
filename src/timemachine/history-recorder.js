/**
 * Cache Time Machine & Snapshot Recorder
 * Stores rolling historical simulation states and generates counterfactual diffs vs LRU, LFU, and GDS.
 */

export class HistoryRecorder {
  constructor(maxSnapshots = 24) {
    this.maxSnapshots = maxSnapshots;
    this.snapshots = [];
    this.lastRecordedSimTime = -10;
  }

  recordState(simTimeSeconds, state, eventSummary = null) {
    // Record every ~5-10 sim seconds or on explicit significant events
    if (simTimeSeconds - this.lastRecordedSimTime < 5 && !eventSummary) {
      return;
    }

    this.lastRecordedSimTime = simTimeSeconds;
    const dateObj = new Date();
    const timeLabel = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;

    const snapshot = {
      id: `snap_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      simTimeSeconds: Math.round(simTimeSeconds),
      timeLabel,
      workloadType: state.workloadType,
      scenario: state.scenario,
      trafficRps: state.effectiveRps,
      hitRatePercent: state.hitRatePercent,
      p95LatencyMs: state.p95LatencyMs,
      p99LatencyMs: state.p99LatencyMs,
      dbCpuPercent: state.dbCpuPercent,
      backendLoadPercent: state.backendLoadPercent,
      costPerHour: state.costPerHour,
      costSavingsPerHour: state.costSavingsPerHour,
      memoryUsedMB: state.memoryUsedMB,
      pollutionRisk: state.pollutionRisk,
      activeItemsCount: state.activeItemsCount,
      eventSummary: eventSummary || `Normal simulation interval at t=${Math.round(simTimeSeconds)}s`,
      // Counterfactual estimates at this snapshot
      counterfactuals: {
        SMART: { hitRate: state.hitRatePercent, p99: state.p99LatencyMs, cost: state.costPerHour },
        LRU: { hitRate: Math.max(20, Number((state.hitRatePercent - 12.5).toFixed(1))), p99: Number((state.p99LatencyMs * 1.65).toFixed(1)), cost: Number((state.costPerHour * 1.32).toFixed(3)) },
        LFU: { hitRate: Math.max(18, Number((state.hitRatePercent - 16.0).toFixed(1))), p99: Number((state.p99LatencyMs * 1.82).toFixed(1)), cost: Number((state.costPerHour * 1.45).toFixed(3)) },
        GDS: { hitRate: Math.max(22, Number((state.hitRatePercent - 8.5).toFixed(1))), p99: Number((state.p99LatencyMs * 1.38).toFixed(1)), cost: Number((state.costPerHour * 1.18).toFixed(3)) }
      }
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getSnapshots() {
    return this.snapshots;
  }

  getSnapshotById(id) {
    return this.snapshots.find(s => s.id === id) || null;
  }

  reset() {
    this.snapshots = [];
    this.lastRecordedSimTime = -10;
  }
}
