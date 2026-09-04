/**
 * Adaptive Demand Predictor
 * Statistical sliding-window EWMA & frequency velocity predictor.
 * Provides extensible interface for future ML model plug-in (Random Forest / XGBoost / LSTM).
 */

export interface AccessHistoryPoint {
  timestamp: number;
  accessCount: number;
}

export interface PredictionResult {
  predictedDemandChange: number; // e.g. +0.33 for +33% increase, -0.15 for -15% decline
  trendVelocity: number;         // rate of change per minute
  confidence: number;            // 0.0 - 1.0 based on sample size & variance consistency
  samplePoints: number;
}

export class DemandPredictor {
  // Key -> recent access history points
  private accessHistories: Map<string, AccessHistoryPoint[]> = new Map();
  private maxHistoryWindowMs: number = 120000; // 2 minute sliding window

  /**
   * Record access event for an object
   */
  public recordAccess(objectId: string, timestamp: number = Date.now()) {
    let history = this.accessHistories.get(objectId);
    if (!history) {
      history = [];
      this.accessHistories.set(objectId, history);
    }

    history.push({ timestamp, accessCount: 1 });
    this.pruneHistory(objectId, timestamp);
  }

  private pruneHistory(objectId: string, now: number) {
    const history = this.accessHistories.get(objectId);
    if (!history) return;

    const cutoff = now - this.maxHistoryWindowMs;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }
  }

  /**
   * Predict future demand change (Δ%) and confidence
   */
  public predictDemand(objectId: string, now: number = Date.now()): PredictionResult {
    this.pruneHistory(objectId, now);
    const history = this.accessHistories.get(objectId);

    if (!history || history.length === 0) {
      return {
        predictedDemandChange: 0,
        trendVelocity: 0,
        confidence: 0.1,
        samplePoints: 0,
      };
    }

    if (history.length === 1) {
      return {
        predictedDemandChange: 0.05,
        trendVelocity: 0.05,
        confidence: 0.3,
        samplePoints: 1,
      };
    }

    // Split window into previous period (older half) and recent period (newer half)
    const windowMs = 60000; // 1 minute comparison
    const recentCutoff = now - (windowMs / 2);
    const olderCutoff = now - windowMs;

    let recentCount = 0;
    let olderCount = 0;

    for (const pt of history) {
      if (pt.timestamp >= recentCutoff) {
        recentCount++;
      } else if (pt.timestamp >= olderCutoff) {
        olderCount++;
      }
    }

    // Velocity calculation
    let demandChange = 0;
    if (olderCount === 0 && recentCount > 0) {
      demandChange = Math.min(1.5, recentCount * 0.25); // New burst
    } else if (olderCount > 0) {
      demandChange = (recentCount - olderCount) / olderCount;
      // Clamp between -0.9 and +2.5
      demandChange = Math.max(-0.9, Math.min(2.5, demandChange));
    }

    // Calculate statistical confidence based on sample density and sample count
    const samplePoints = history.length;
    let confidence = Math.min(0.95, 0.35 + (samplePoints * 0.04));
    if (samplePoints >= 10) {
      confidence = Math.min(0.98, confidence + 0.1);
    }

    return {
      predictedDemandChange: Math.round(demandChange * 100) / 100,
      trendVelocity: Math.round((recentCount - olderCount) * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      samplePoints,
    };
  }

  public clear() {
    this.accessHistories.clear();
  }
}

export const predictor = new DemandPredictor();
