/**
 * Dynamic TTL Engine
 * Continuously recalibrates object time-to-live based on popularity, volatility, retrieval cost, and trend.
 */

import { DEFAULT_CONFIG } from '../core/types.js';

export class DynamicTTLManager {
  constructor(config = DEFAULT_CONFIG) {
    this.minTTL = config.minTTL || 15;
    this.maxTTL = config.maxTTL || 600;
    this.defaultTTL = config.defaultTTL || 90;
  }

  /**
   * Recalculates dynamic TTL for an entry
   */
  computeTTL(entry, evaluation) {
    const prevTTL = entry.currentTTL || this.defaultTTL;
    const { factors } = evaluation;

    // Base multipliers
    const popularityBonus = factors.popularity * 1.5;     // Up to +150%
    const retrievalCostBonus = factors.retrievalCost * 1.2; // Up to +120%
    const trendMultiplier = (factors.trend >= 0.5) ? (1 + (factors.trend - 0.5) * 1.0) : (0.5 + factors.trend);
    
    // Volatility penalty (if data mutates frequently, clamp TTL to avoid serving stale data)
    const volatility = entry.updateVolatility || 0.1;
    const volatilityPenalty = Math.max(0.3, 1.0 - (volatility * 0.8));

    // Dynamic TTL formula
    const rawTTL = this.defaultTTL * (1 + popularityBonus + retrievalCostBonus) * trendMultiplier * volatilityPenalty;
    const newTTL = Math.round(Math.max(this.minTTL, Math.min(this.maxTTL, rawTTL)));

    // Generate causal reason for change
    let reason = 'Steady-state baseline TTL';
    const delta = newTTL - prevTTL;

    if (Math.abs(delta) >= 10) {
      if (delta > 0) {
        if (factors.popularity > 0.6) {
          reason = `Extended (+${delta}s): Popularity surged & high retrieval cost (${entry.baseDbLatencyMs}ms).`;
        } else if (factors.trend > 0.6) {
          reason = `Extended (+${delta}s): Positive request trend detected.`;
        } else {
          reason = `Extended (+${delta}s): High utility reuse pattern.`;
        }
      } else {
        if (volatility > 0.5) {
          reason = `Shortened (${delta}s): High data volatility (${Math.round(volatility * 100)}% mutation rate).`;
        } else if (factors.trend < 0.4) {
          reason = `Shortened (${delta}s): Fading demand trend.`;
        } else {
          reason = `Shortened (${delta}s): Low reuse probability.`;
        }
      }
    }

    return {
      prevTTL,
      newTTL,
      ttlDelta: delta,
      reason,
      volatility
    };
  }
}
