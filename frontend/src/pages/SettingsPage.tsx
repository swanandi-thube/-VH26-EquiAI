/**
 * System Settings & Adaptive Weights Configuration Page
 * Persists scoring weights, memory limits, rate limit thresholds, and cost assumptions to the backend.
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  RotateCcw,
  HardDrive,
  Clock,
  Shield,
  Zap,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { apiClient } from '../api/client';
import { SystemSettings } from '../types';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const fetchSettings = async () => {
    try {
      const data = await apiClient.getSettings();
      setSettings(data);
    } catch (err) {
      console.warn('Error loading settings:', err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const updated = await apiClient.updateSettings(settings);
      setSettings(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error saving settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="p-12 text-center text-slate-400 font-mono text-sm">
        Loading system configuration from backend...
      </div>
    );
  }

  const capacityMb = Math.round(settings.cacheCapacityBytes / (1024 * 1024));

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            System Configuration & Adaptive Weights
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Configure backend decision parameters, cache thresholds, and resilience policies
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-xs font-mono rounded-xl shadow-lg shadow-amber-900/20 transition-all cursor-pointer shrink-0 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'SAVING CHANGES...' : 'SAVE CONFIGURATION'}
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4" />
          System configuration successfully persisted to backend database.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
        {/* Section 1: Adaptive Decision Weights */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-dark-750">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-stone-200 uppercase tracking-wider">
              Adaptive Scoring Weights
            </span>
          </div>

          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Demand Velocity Weight ($w_d$):</span>
                <span className="text-amber-400 font-bold">{settings.weights.demand.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={settings.weights.demand}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weights: { ...settings.weights, demand: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-amber-500 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Frequency Recurrence Weight ($w_f$):</span>
                <span className="text-amber-400 font-bold">{settings.weights.frequency.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={settings.weights.frequency}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weights: { ...settings.weights, frequency: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-amber-500 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Recency Decay Weight ($w_r$):</span>
                <span className="text-amber-400 font-bold">{settings.weights.recency.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={settings.weights.recency}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weights: { ...settings.weights, recency: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-amber-500 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Retrieval Cost Weight ($w_c$):</span>
                <span className="text-orange-400 font-bold">{settings.weights.retrievalCost.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={settings.weights.retrievalCost}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weights: { ...settings.weights, retrievalCost: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-orange-400 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Backend Pressure Weight ($w_p$):</span>
                <span className="text-amber-300 font-bold">{settings.weights.backendPressure.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={settings.weights.backendPressure}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weights: { ...settings.weights, backendPressure: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-amber-300 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Memory Cost Penalty ($w_m$):</span>
                <span className="text-rose-400 font-bold">{settings.weights.memoryCostPenalty.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={settings.weights.memoryCostPenalty}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weights: { ...settings.weights, memoryCostPenalty: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-rose-400 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Cache & Protection Thresholds */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-dark-750">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-stone-200 uppercase tracking-wider">
              Capacity & Resilience Policies
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-stone-400 block mb-1">Redis Cache Capacity (MB):</label>
              <input
                type="number"
                value={capacityMb}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cacheCapacityBytes: (parseInt(e.target.value, 10) || 64) * 1024 * 1024,
                  })
                }
                className="w-full bg-dark-850 border border-dark-750 rounded-lg px-3 py-1.5 text-stone-200 focus:border-amber-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-stone-400 block mb-1">Default Base TTL (seconds):</label>
              <input
                type="number"
                value={settings.defaultTtlSeconds}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultTtlSeconds: parseInt(e.target.value, 10) || 300,
                  })
                }
                className="w-full bg-dark-850 border border-dark-750 rounded-lg px-3 py-1.5 text-stone-200 focus:border-amber-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-stone-400 block mb-1">Rate Limiter Threshold (RPS):</label>
              <input
                type="number"
                value={settings.rateLimitRps}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    rateLimitRps: parseInt(e.target.value, 10) || 200,
                  })
                }
                className="w-full bg-dark-850 border border-dark-750 rounded-lg px-3 py-1.5 text-stone-200 focus:border-amber-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-stone-400 block mb-1">Circuit Breaker Error Threshold (0.0 - 1.0):</label>
              <input
                type="number"
                step="0.05"
                value={settings.circuitBreakerFailureThreshold}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    circuitBreakerFailureThreshold: parseFloat(e.target.value) || 0.5,
                  })
                }
                className="w-full bg-dark-850 border border-dark-750 rounded-lg px-3 py-1.5 text-stone-200 focus:border-amber-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-stone-400 block mb-1">Circuit Breaker Recovery Timeout (ms):</label>
              <input
                type="number"
                value={settings.circuitBreakerRecoveryTimeMs}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    circuitBreakerRecoveryTimeMs: parseInt(e.target.value, 10) || 5000,
                  })
                }
                className="w-full bg-dark-850 border border-dark-750 rounded-lg px-3 py-1.5 text-stone-200 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
