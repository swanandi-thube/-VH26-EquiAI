/**
 * Settings Repository
 * Persists and retrieves system configuration and adaptive weights.
 */

import { dbClient } from '../database/client';
import { SystemSettings } from '../types';

export const DEFAULT_SETTINGS: SystemSettings = {
  cacheCapacityBytes: 64 * 1024 * 1024, // 64 MB default
  defaultTtlSeconds: 300,
  minTtlSeconds: 30,
  maxTtlSeconds: 3600,
  predictionWindowSeconds: 60,
  rateLimitRps: 250,
  circuitBreakerFailureThreshold: 0.5,
  circuitBreakerRecoveryTimeMs: 5000,
  weights: {
    demand: 0.25,
    frequency: 0.20,
    recency: 0.15,
    trend: 0.15,
    retrievalCost: 0.20,
    backendPressure: 0.15,
    memoryCostPenalty: 0.10,
  },
  costAssumptions: {
    backendRequestCostUsd: 0.00004,
    computeCostPerHourUsd: 0.25,
    memoryCostPerGbHourUsd: 0.018,
    databaseIoCostUsd: 0.000025,
    networkEgressCostPerGbUsd: 0.08,
  },
};

export class SettingsRepository {
  private fallbackSettings: SystemSettings = { ...DEFAULT_SETTINGS };

  /**
   * Get current active system settings
   */
  public async getSettings(): Promise<SystemSettings> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query('SELECT * FROM system_settings WHERE id = $1', ['default']);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            cacheCapacityBytes: parseInt(row.cache_capacity_bytes, 10),
            defaultTtlSeconds: parseInt(row.default_ttl_seconds, 10),
            minTtlSeconds: parseInt(row.min_ttl_seconds, 10),
            maxTtlSeconds: parseInt(row.max_ttl_seconds, 10),
            predictionWindowSeconds: parseInt(row.prediction_window_seconds, 10),
            rateLimitRps: parseInt(row.rate_limit_rps, 10),
            circuitBreakerFailureThreshold: parseFloat(row.circuit_breaker_failure_threshold),
            circuitBreakerRecoveryTimeMs: parseInt(row.circuit_breaker_recovery_time_ms, 10),
            weights: typeof row.weights === 'string' ? JSON.parse(row.weights) : row.weights,
            costAssumptions: typeof row.cost_assumptions === 'string' ? JSON.parse(row.cost_assumptions) : row.cost_assumptions,
          };
        }
      } catch (err: any) {
        console.warn(`[SettingsRepo] DB get settings error:`, err.message);
      }
    }

    return { ...this.fallbackSettings };
  }

  /**
   * Update and persist system settings
   */
  public async updateSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
    this.fallbackSettings = {
      ...this.fallbackSettings,
      ...patch,
      weights: {
        ...this.fallbackSettings.weights,
        ...(patch.weights || {}),
      },
      costAssumptions: {
        ...this.fallbackSettings.costAssumptions,
        ...(patch.costAssumptions || {}),
      },
    };

    if (dbClient.isConnected) {
      try {
        const current = this.fallbackSettings;
        await dbClient.query(
          `INSERT INTO system_settings (
            id, cache_capacity_bytes, default_ttl_seconds, min_ttl_seconds,
            max_ttl_seconds, prediction_window_seconds, rate_limit_rps,
            circuit_breaker_failure_threshold, circuit_breaker_recovery_time_ms,
            weights, cost_assumptions, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (id) DO UPDATE SET
            cache_capacity_bytes = EXCLUDED.cache_capacity_bytes,
            default_ttl_seconds = EXCLUDED.default_ttl_seconds,
            min_ttl_seconds = EXCLUDED.min_ttl_seconds,
            max_ttl_seconds = EXCLUDED.max_ttl_seconds,
            prediction_window_seconds = EXCLUDED.prediction_window_seconds,
            rate_limit_rps = EXCLUDED.rate_limit_rps,
            circuit_breaker_failure_threshold = EXCLUDED.circuit_breaker_failure_threshold,
            circuit_breaker_recovery_time_ms = EXCLUDED.circuit_breaker_recovery_time_ms,
            weights = EXCLUDED.weights,
            cost_assumptions = EXCLUDED.cost_assumptions,
            updated_at = NOW()`,
          [
            'default',
            current.cacheCapacityBytes,
            current.defaultTtlSeconds,
            current.minTtlSeconds,
            current.maxTtlSeconds,
            current.predictionWindowSeconds,
            current.rateLimitRps,
            current.circuitBreakerFailureThreshold,
            current.circuitBreakerRecoveryTimeMs,
            JSON.stringify(current.weights),
            JSON.stringify(current.costAssumptions),
          ]
        );
      } catch (err: any) {
        console.warn(`[SettingsRepo] DB update settings error:`, err.message);
      }
    }

    return { ...this.fallbackSettings };
  }
}

export const settingsRepository = new SettingsRepository();
