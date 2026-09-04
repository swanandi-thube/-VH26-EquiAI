/**
 * What-If Scenario Analysis Page
 * Deterministic counterfactual simulation modeling changes to traffic, capacity, and latency.
 */

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  TrendingUp,
  TrendingDown,
  Check,
  RotateCcw,
  Zap,
  Radio,
  Clock,
  Server,
  DollarSign,
  HardDrive
} from 'lucide-react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { apiClient } from '../api/client';
import { WhatIfComparison, WhatIfScenarioInput } from '../types';

export const WhatIfPage: React.FC = () => {
  const { telemetry, refreshHealth } = useTelemetryContext();

  const [trafficMultiplier, setTrafficMultiplier] = useState(2.0);
  const [cacheCapacityMb, setCacheCapacityMb] = useState(128);
  const [backendLatencyMs, setBackendLatencyMs] = useState(120);
  const [backendErrorRate, setBackendErrorRate] = useState(0.0);
  const [comparison, setComparison] = useState<WhatIfComparison | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const runScenarioEvaluation = async () => {
    try {
      const scenario: WhatIfScenarioInput = {
        trafficMultiplier,
        cacheCapacityMb,
        backendLatencyMs,
        backendErrorRate,
      };
      const result = await apiClient.runWhatIfScenario(scenario);
      setComparison(result);
    } catch (err) {
      console.warn('Error running what-if scenario:', err);
    }
  };

  useEffect(() => {
    runScenarioEvaluation();
  }, [trafficMultiplier, cacheCapacityMb, backendLatencyMs, backendErrorRate, telemetry]);

  const handleApplyScenario = async () => {
    setIsApplying(true);
    try {
      await apiClient.applyScenario({
        trafficMultiplier,
        cacheCapacityMb,
        backendLatencyMs,
        backendErrorRate,
      });
      setAppliedMessage(`Scenario applied: Cache Capacity scaled to ${cacheCapacityMb} MB.`);
      await refreshHealth();
      setTimeout(() => setAppliedMessage(null), 4000);
    } catch (err: any) {
      alert(`Error applying scenario: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-brand-purple" />
            What-If Counterfactual Scenario Analysis
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Model the impact of traffic scaling, cache resizing, and latency shifts before applying changes to live systems
          </p>
        </div>

        <button
          onClick={handleApplyScenario}
          disabled={isApplying}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-purple hover:bg-purple-600 text-white font-extrabold text-xs font-mono rounded-xl shadow-lg shadow-brand-purple/20 transition-all cursor-pointer shrink-0"
        >
          <Check className="w-4 h-4" />
          {isApplying ? 'APPLYING TO LIVE...' : 'APPLY SCENARIO'}
        </button>
      </div>

      {appliedMessage && (
        <div className="p-3 bg-brand-emerald/10 border border-brand-emerald/30 text-brand-emerald text-xs font-mono rounded-xl animate-fadeIn">
          ✓ {appliedMessage}
        </div>
      )}

      {/* Main Grid: Left Controls, Right Projected Comparison Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Card */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-5 font-mono text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-dark-750">
            <span className="font-bold text-slate-200 uppercase tracking-wider">
              Simulation Inputs
            </span>
          </div>

          {/* Traffic Multiplier */}
          <div>
            <div className="flex justify-between text-slate-300 mb-1.5">
              <span>Traffic Multiplier:</span>
              <span className="text-brand-purple font-bold">{trafficMultiplier.toFixed(1)}x</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[1.0, 2.0, 3.0, 5.0].map((m) => (
                <button
                  key={m}
                  onClick={() => setTrafficMultiplier(m)}
                  className={`py-1 rounded text-[11px] border transition-colors ${
                    trafficMultiplier === m
                      ? 'bg-brand-purple text-white border-brand-purple font-bold'
                      : 'bg-dark-850 border-dark-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m}x
                </button>
              ))}
            </div>
            <input
              type="range"
              min="1.0"
              max="5.0"
              step="0.5"
              value={trafficMultiplier}
              onChange={(e) => setTrafficMultiplier(parseFloat(e.target.value))}
              className="w-full accent-brand-purple bg-dark-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Cache Capacity */}
          <div>
            <div className="flex justify-between text-slate-300 mb-1.5">
              <span>Cache Capacity:</span>
              <span className="text-brand-emerald font-bold">{cacheCapacityMb >= 1024 ? `${(cacheCapacityMb/1024).toFixed(1)} GB` : `${cacheCapacityMb} MB`}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[64, 128, 512, 1024].map((c) => (
                <button
                  key={c}
                  onClick={() => setCacheCapacityMb(c)}
                  className={`py-1 rounded text-[11px] border transition-colors ${
                    cacheCapacityMb === c
                      ? 'bg-brand-emerald text-black border-brand-emerald font-bold'
                      : 'bg-dark-850 border-dark-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {c >= 1024 ? '1 GB' : `${c} MB`}
                </button>
              ))}
            </div>
            <input
              type="range"
              min="32"
              max="2048"
              step="32"
              value={cacheCapacityMb}
              onChange={(e) => setCacheCapacityMb(parseInt(e.target.value, 10))}
              className="w-full accent-brand-emerald bg-dark-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Backend Latency */}
          <div>
            <div className="flex justify-between text-slate-300 mb-1.5">
              <span>DB Latency Impact:</span>
              <span className="text-amber-400 font-bold">{backendLatencyMs} ms</span>
            </div>
            <input
              type="range"
              min="10"
              max="450"
              step="10"
              value={backendLatencyMs}
              onChange={(e) => setBackendLatencyMs(parseInt(e.target.value, 10))}
              className="w-full accent-amber-400 bg-dark-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Error Rate */}
          <div>
            <div className="flex justify-between text-slate-300 mb-1.5">
              <span>Simulated Backend Faults:</span>
              <span className="text-brand-rose font-bold">{(backendErrorRate * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.4"
              step="0.05"
              value={backendErrorRate}
              onChange={(e) => setBackendErrorRate(parseFloat(e.target.value))}
              className="w-full accent-brand-rose bg-dark-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Projected Comparison Matrix */}
        <div className="lg:col-span-2 space-y-4 font-mono">
          <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-dark-750">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Current vs. Projected Metric Projections
              </span>
              <span className="text-[10px] text-brand-purple bg-brand-purple/10 px-2 py-0.5 rounded border border-brand-purple/20">
                Mathematical Model Output
              </span>
            </div>

            {comparison ? (
              <div className="space-y-3">
                {/* Metric 1: Hit Rate */}
                <div className="bg-dark-850 p-4 rounded-xl border border-dark-700 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-brand-emerald" />
                      Cache Hit Rate
                    </div>
                    <div className="text-[11px] text-slate-400">Current: {(comparison.current.hitRate * 100).toFixed(1)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-brand-emerald">
                      {(comparison.projected.hitRate * 100).toFixed(1)}%
                    </div>
                    <div className={`text-[11px] font-semibold ${comparison.difference.hitRateDelta >= 0 ? 'text-brand-emerald' : 'text-brand-rose'}`}>
                      {comparison.difference.hitRateDelta >= 0 ? `+${(comparison.difference.hitRateDelta * 100).toFixed(1)}%` : `${(comparison.difference.hitRateDelta * 100).toFixed(1)}%`}
                    </div>
                  </div>
                </div>

                {/* Metric 2: Average Latency */}
                <div className="bg-dark-850 p-4 rounded-xl border border-dark-700 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-brand-cyan" />
                      Average Latency
                    </div>
                    <div className="text-[11px] text-slate-400">Current: {comparison.current.avgLatencyMs} ms</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-brand-cyan">
                      {comparison.projected.avgLatencyMs} ms
                    </div>
                    <div className={`text-[11px] font-semibold ${comparison.difference.latencyDeltaMs <= 0 ? 'text-brand-emerald' : 'text-amber-400'}`}>
                      {comparison.difference.latencyDeltaMs <= 0 ? `${comparison.difference.latencyDeltaMs} ms` : `+${comparison.difference.latencyDeltaMs} ms`}
                    </div>
                  </div>
                </div>

                {/* Metric 3: Backend Miss Load */}
                <div className="bg-dark-850 p-4 rounded-xl border border-dark-700 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-blue-400" />
                      Backend DB Load Ratio
                    </div>
                    <div className="text-[11px] text-slate-400">Current: {(comparison.current.backendLoadRatio * 100).toFixed(1)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-400">
                      {(comparison.projected.backendLoadRatio * 100).toFixed(1)}%
                    </div>
                    <div className={`text-[11px] font-semibold ${comparison.difference.backendLoadDelta <= 0 ? 'text-brand-emerald' : 'text-brand-rose'}`}>
                      {comparison.difference.backendLoadDelta <= 0 ? `${(comparison.difference.backendLoadDelta * 100).toFixed(1)}%` : `+${(comparison.difference.backendLoadDelta * 100).toFixed(1)}%`}
                    </div>
                  </div>
                </div>

                {/* Metric 4: Estimated Infrastructure Cost */}
                <div className="bg-dark-850 p-4 rounded-xl border border-dark-700 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                      Infrastructure Cost / Hour
                    </div>
                    <div className="text-[11px] text-slate-400">Current: ${comparison.current.costPerHourUsd.toFixed(3)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-amber-400">
                      ${comparison.projected.costPerHourUsd.toFixed(3)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Δ ${comparison.difference.costDeltaUsd >= 0 ? `+${comparison.difference.costDeltaUsd.toFixed(3)}` : comparison.difference.costDeltaUsd.toFixed(3)}/hr
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                Computing scenario projection...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
