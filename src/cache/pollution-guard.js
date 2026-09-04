/**
 * Cache Pollution Defense Engine
 * Detects low-reuse flood patterns and protects high-value cached items from eviction churn.
 */

import { POLLUTION_RISK } from '../core/types.js';

export class PollutionGuard {
  constructor() {
    this.windowRequests = [];
    this.windowMaxDuration = 10; // 10 seconds sliding window
    this.riskLevel = POLLUTION_RISK.LOW;
    this.uniqueKeyRate = 0.12;
    this.usefulOccupancyPercent = 85;
    this.protectedKeys = new Set();
    this.quarantinedKeys = new Set();
  }

  recordRequest(key, isPollutionKey, timestamp) {
    this.windowRequests.push({ key, isPollutionKey: !!isPollutionKey, timestamp });
    
    // Purge old requests outside window
    const cutoff = timestamp - this.windowMaxDuration;
    while (this.windowRequests.length > 0 && this.windowRequests[0].timestamp < cutoff) {
      this.windowRequests.shift();
    }
  }

  evaluate(cacheEntries, currentTime) {
    const totalInWindow = this.windowRequests.length;
    if (totalInWindow < 10) {
      this.riskLevel = POLLUTION_RISK.LOW;
      this.uniqueKeyRate = 0.15;
      return this.getStatus();
    }

    const uniqueKeys = new Set(this.windowRequests.map(r => r.key));
    const uniqueRatio = uniqueKeys.size / totalInWindow;
    this.uniqueKeyRate = Number(uniqueRatio.toFixed(3));

    // Determine Pollution Risk Level
    if (uniqueRatio > 0.70 || this.windowRequests.filter(r => r.isPollutionKey).length / totalInWindow > 0.40) {
      this.riskLevel = POLLUTION_RISK.HIGH;
    } else if (uniqueRatio > 0.40) {
      this.riskLevel = POLLUTION_RISK.MEDIUM;
    } else {
      this.riskLevel = POLLUTION_RISK.LOW;
    }

    // Evaluate useful cache occupancy vs single-hit wasted space
    let totalBytes = 0;
    let usefulBytes = 0;
    this.protectedKeys.clear();

    for (const entry of cacheEntries) {
      totalBytes += entry.sizeBytes;
      const isHighValue = (entry.score >= 0.55 || entry.totalHits >= 3);
      if (isHighValue) {
        usefulBytes += entry.sizeBytes;
        if (this.riskLevel !== POLLUTION_RISK.LOW) {
          this.protectedKeys.add(entry.id);
        }
      }
    }

    this.usefulOccupancyPercent = totalBytes > 0 
      ? Math.round((usefulBytes / totalBytes) * 100)
      : 80;

    return this.getStatus();
  }

  isProtected(key) {
    return this.riskLevel !== POLLUTION_RISK.LOW && this.protectedKeys.has(key);
  }

  getStatus() {
    let explanation = "Normal traffic access patterns. Useful cache occupancy is optimal.";
    if (this.riskLevel === POLLUTION_RISK.HIGH) {
      explanation = "CRITICAL: Low-reuse objects are flooding the cache. High-value resident objects are actively protected against eviction.";
    } else if (this.riskLevel === POLLUTION_RISK.MEDIUM) {
      explanation = "WARNING: Elevated unique-key rate detected. Probationary admission threshold enabled.";
    }

    return {
      riskLevel: this.riskLevel,
      uniqueKeyRatePercent: Math.round(this.uniqueKeyRate * 100),
      usefulOccupancyPercent: this.usefulOccupancyPercent,
      protectedCount: this.protectedKeys.size,
      explanation,
      isMitigating: this.riskLevel !== POLLUTION_RISK.LOW
    };
  }

  reset() {
    this.windowRequests = [];
    this.riskLevel = POLLUTION_RISK.LOW;
    this.uniqueKeyRate = 0.12;
    this.usefulOccupancyPercent = 85;
    this.protectedKeys.clear();
    this.quarantinedKeys.clear();
  }
}
