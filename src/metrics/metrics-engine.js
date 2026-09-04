/**
 * Metrics Engine & Reservoir Percentile Sampler
 * Accurately tracks P50, P95, P99 latencies, hit rates, and rolling time-series telemetry.
 */

export class MetricsEngine {
  constructor(historyLimit = 60) {
    this.historyLimit = historyLimit;
    this.latencyReservoir = [];
    this.reservoirCapacity = 1000;

    // Rolling history series for charts
    this.history = {
      timestamps: [],
      trafficRps: [],
      hitRatePercent: [],
      p50LatencyMs: [],
      p95LatencyMs: [],
      p99LatencyMs: [],
      costPerHour: [],
      backendLoadPercent: [],
      dbCpuPercent: [],
      memoryUsedMB: []
    };
  }

  addLatencySamples(samples) {
    for (const lat of samples) {
      if (this.latencyReservoir.length < this.reservoirCapacity) {
        this.latencyReservoir.push(lat);
      } else {
        const idx = Math.floor(Math.random() * this.reservoirCapacity);
        this.latencyReservoir[idx] = lat;
      }
    }
  }

  computePercentiles() {
    if (this.latencyReservoir.length === 0) {
      return { p50: 2.5, p95: 12.0, p99: 45.0, avg: 5.0 };
    }

    const sorted = [...this.latencyReservoir].sort((a, b) => a - b);
    const n = sorted.length;

    const p50 = sorted[Math.floor(n * 0.50)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const p99 = sorted[Math.floor(n * 0.99)];
    const avg = sorted.reduce((acc, v) => acc + v, 0) / n;

    return {
      p50: Number(p50.toFixed(1)),
      p95: Number(p95.toFixed(1)),
      p99: Number(p99.toFixed(1)),
      avg: Number(avg.toFixed(1))
    };
  }

  recordSnapshot(snapshot) {
    const {
      simTime,
      trafficRps,
      hitRatePercent,
      p50,
      p95,
      p99,
      costPerHour,
      backendLoadPercent,
      dbCpuPercent,
      memoryUsedMB
    } = snapshot;

    this.history.timestamps.push(simTime);
    this.history.trafficRps.push(trafficRps);
    this.history.hitRatePercent.push(hitRatePercent);
    this.history.p50LatencyMs.push(p50);
    this.history.p95LatencyMs.push(p95);
    this.history.p99LatencyMs.push(p99);
    this.history.costPerHour.push(costPerHour);
    this.history.backendLoadPercent.push(backendLoadPercent);
    this.history.dbCpuPercent.push(dbCpuPercent);
    this.history.memoryUsedMB.push(memoryUsedMB);

    // Trim ring buffer
    if (this.history.timestamps.length > this.historyLimit) {
      for (const key of Object.keys(this.history)) {
        this.history[key].shift();
      }
    }
  }

  getRollingHistory() {
    return this.history;
  }

  reset() {
    this.latencyReservoir = [];
    for (const key of Object.keys(this.history)) {
      this.history[key] = [];
    }
  }
}
