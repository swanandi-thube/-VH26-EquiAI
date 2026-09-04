/**
 * Application Backend Service Simulator
 * Simulates application compute threads, request routing, and end-to-end latency distribution.
 */

export class BackendService {
  constructor() {
    this.baseHitLatencyMs = 2.4; // Fast in-memory lookup
    this.threadPoolSize = 64;
    this.activeThreads = 4;
    this.backendLoadPercent = 14;
  }

  processRequestBatch(results, dbTelemetry, workloadType) {
    const latencies = [];
    let totalComputeUnits = 0;

    for (const res of results) {
      if (res.hit) {
        // Fast Cache Hit: 1.2ms to 4.0ms
        const jitter = (Math.random() - 0.5) * 1.2;
        const latency = Math.max(1.0, this.baseHitLatencyMs + jitter);
        latencies.push(latency);
      } else {
        // Cache Miss: DB Latency + Recomputation + Deserialization
        const isRec = (workloadType === 'COMPUTE_HEAVY_REC');
        const recomputeTime = isRec ? (res.item.recomputeCostUnits || 1) * 12 : (res.item.recomputeCostUnits || 1) * 2;
        const dbLatency = dbTelemetry.currentLatencyMs;
        const queuePenalty = dbTelemetry.queuedRequests > 0 ? (dbTelemetry.queuedRequests * 1.5) : 0;
        
        const totalMissLatency = dbLatency + recomputeTime + queuePenalty + (Math.random() * 8);
        latencies.push(Number(totalMissLatency.toFixed(1)));
        totalComputeUnits += (res.item.recomputeCostUnits || 1);
      }
    }

    // Backend thread load
    const missCount = results.filter(r => !r.hit).length;
    const loadFromHits = (results.length - missCount) * 0.02;
    const loadFromMisses = missCount * 0.45 + totalComputeUnits * 0.2;
    
    this.backendLoadPercent = Math.min(
      98,
      Math.max(10, Number((12 + loadFromHits + loadFromMisses).toFixed(1)))
    );
    this.activeThreads = Math.min(
      this.threadPoolSize,
      Math.max(3, Math.round((this.backendLoadPercent / 100) * this.threadPoolSize))
    );

    return {
      latencies,
      backendLoadPercent: this.backendLoadPercent,
      activeThreads: this.activeThreads,
      threadPoolPercent: Math.round((this.activeThreads / this.threadPoolSize) * 100)
    };
  }

  reset() {
    this.activeThreads = 4;
    this.backendLoadPercent = 14;
  }
}
