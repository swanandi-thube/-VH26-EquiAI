/**
 * Database & Storage System Simulator
 * Models connection pool utilization, CPU load, query queue latency, and IOPS based on miss rates and traffic.
 */

import { DEFAULT_CONFIG } from '../core/types.js';

export class DatabaseSimulator {
  constructor(config = DEFAULT_CONFIG.database) {
    this.maxConnections = config.maxConnections || 100;
    this.baseLatencyMs = config.baseLatencyMs || 45;
    this.computeCoreCapacity = config.computeCoreCapacity || 16;
    
    // Telemetry state
    this.activeConnections = 8;
    this.cpuUtilizationPercent = 15;
    this.currentLatencyMs = this.baseLatencyMs;
    this.queriesPerSecond = 0;
    this.queuedRequests = 0;
    this.totalQueriesExecuted = 0;
  }

  processMisses(missCount, deltaMs, workloadType) {
    const deltaSeconds = deltaMs / 1000;
    this.queriesPerSecond = Math.round(missCount / deltaSeconds);
    this.totalQueriesExecuted += missCount;

    // Concurrency calculation
    const queryDurationSeconds = this.currentLatencyMs / 1000;
    const concurrentDemand = this.queriesPerSecond * queryDurationSeconds;
    
    // Pool utilization
    this.activeConnections = Math.min(
      this.maxConnections,
      Math.max(4, Math.round(concurrentDemand * 1.4 + Math.random() * 3))
    );

    // CPU load formula: Base (10%) + Query Volume Load + Queuing stress
    const isComputeHeavy = (workloadType === 'COMPUTE_HEAVY_REC');
    const loadFactor = isComputeHeavy ? 1.8 : 0.8;
    const baseCpu = 10;
    const dynamicCpu = (this.queriesPerSecond / (this.computeCoreCapacity * 25)) * 100 * loadFactor;
    
    this.cpuUtilizationPercent = Math.min(
      99.5,
      Math.max(12, Number((baseCpu + dynamicCpu).toFixed(1)))
    );

    // Queue & Latency model (M/M/c queueing effect)
    const utilizationRatio = this.cpuUtilizationPercent / 100;
    if (utilizationRatio > 0.85) {
      // Saturation hockey stick curve
      const queueMultiplier = 1 + Math.pow((utilizationRatio - 0.85) / 0.15, 2) * 3.5;
      this.currentLatencyMs = Math.round(this.baseLatencyMs * queueMultiplier);
      this.queuedRequests = Math.round((utilizationRatio - 0.85) * 80);
    } else {
      this.currentLatencyMs = Math.round(this.baseLatencyMs * (1 + utilizationRatio * 0.25));
      this.queuedRequests = 0;
    }

    return this.getTelemetry();
  }

  getTelemetry() {
    return {
      activeConnections: this.activeConnections,
      maxConnections: this.maxConnections,
      connectionPoolPercent: Math.round((this.activeConnections / this.maxConnections) * 100),
      cpuUtilizationPercent: this.cpuUtilizationPercent,
      currentLatencyMs: this.currentLatencyMs,
      queriesPerSecond: this.queriesPerSecond,
      queuedRequests: this.queuedRequests,
      totalQueriesExecuted: this.totalQueriesExecuted
    };
  }

  reset() {
    this.activeConnections = 8;
    this.cpuUtilizationPercent = 15;
    this.currentLatencyMs = this.baseLatencyMs;
    this.queriesPerSecond = 0;
    this.queuedRequests = 0;
    this.totalQueriesExecuted = 0;
  }
}
