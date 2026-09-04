/**
 * Traffic Lab & Real Workload Controller Page (Warm Tech Theme)
 * Executes real reproducible traffic scenarios through the live pipeline with real-time streaming metrics.
 */

import React, { useState } from 'react';
import {
  FlaskConical,
  Play,
  Square,
  Zap,
  Radio,
  Clock,
  HardDrive,
  Shield,
  Activity,
  Server,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { useTelemetryContext } from '../context/TelemetryContext';
import { apiClient } from '../api/client';
import { WorkloadConfig, WorkloadType } from '../types';

export const TrafficLabPage: React.FC = () => {
  const {
    telemetry,
    history,
    isWorkloadRunning,
    activeWorkload,
    checkWorkloadStatus
  } = useTelemetryContext();

  const [selectedType, setSelectedType] = useState<WorkloadType>('STEADY_LOAD');
  const [rps, setRps] = useState<number>(100);
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [duration, setDuration] = useState<number>(45);
  const [objectCount, setObjectCount] = useState<number>(120);
  const [cacheCapacityMb, setCacheCapacityMb] = useState<number>(64);
  const [backendLatencyMs, setBackendLatencyMs] = useState<number>(80);
  const [backendErrorRate, setBackendErrorRate] = useState<number>(0.0);
  const [isStarting, setIsStarting] = useState(false);

  const scenarioPresets: {
    type: WorkloadType;
    name: string;
    description: string;
    iconColor: string;
    defaultRps: number;
    defaultLatency: number;
    defaultError: number;
  }[] = [
    {
      type: 'STEADY_LOAD',
      name: 'Steady Equilibrium',
      description: 'Baseline Zipfian traffic distributed across catalog items.',
      iconColor: 'text-brand-emerald',
      defaultRps: 120,
      defaultLatency: 60,
      defaultError: 0.0,
    },
    {
      type: 'TRAFFIC_SPIKE',
      name: 'Sudden Hotspot Surge',
      description: 'Instant 10x-50x burst concentrated on 3 specific hot items.',
      iconColor: 'text-amber-400',
      defaultRps: 250,
      defaultLatency: 90,
      defaultError: 0.0,
    },
    {
      type: 'COLD_START',
      name: 'Cold Start Sweep',
      description: 'Empties cache and warms it with rapid multi-key lookups.',
      iconColor: 'text-orange-400',
      defaultRps: 150,
      defaultLatency: 75,
      defaultError: 0.0,
    },
    {
      type: 'POPULARITY_SHIFT',
      name: 'Popularity Drift',
      description: 'Concept drift shifting the active hot key cluster over time.',
      iconColor: 'text-amber-300',
      defaultRps: 140,
      defaultLatency: 70,
      defaultError: 0.0,
    },
    {
      type: 'BACKEND_DEGRADATION',
      name: 'Backend Degradation & Faults',
      description: 'High DB query latency + 35% error rate to test Circuit Breaker.',
      iconColor: 'text-brand-rose',
      defaultRps: 180,
      defaultLatency: 420,
      defaultError: 0.35,
    },
    {
      type: 'COMPUTE_HEAVY',
      name: 'Compute-Heavy Recompute',
      description: 'Complex aggregation queries with high CPU cost & long query time.',
      iconColor: 'text-orange-400',
      defaultRps: 90,
      defaultLatency: 320,
      defaultError: 0.0,
    },
    {
      type: 'READ_HEAVY',
      name: 'Read-Heavy Catalog (98%)',
      description: 'Heavy repeat read volume on top 20% cached assets.',
      iconColor: 'text-emerald-400',
      defaultRps: 220,
      defaultLatency: 45,
      defaultError: 0.0,
    },
    {
      type: 'WRITE_HEAVY',
      name: 'Write & Invalidation Churn',
      description: 'Frequent mutations forcing cache invalidation & eviction cycles.',
      iconColor: 'text-rose-400',
      defaultRps: 110,
      defaultLatency: 110,
      defaultError: 0.05,
    },
  ];

  const handleSelectPreset = (preset: typeof scenarioPresets[0]) => {
    setSelectedType(preset.type);
    setRps(preset.defaultRps);
    setBackendLatencyMs(preset.defaultLatency);
    setBackendErrorRate(preset.defaultError);
  };

  const handleStartTest = async () => {
    setIsStarting(true);
    try {
      const config: WorkloadConfig = {
        type: selectedType,
        requestsPerSecond: rps,
        durationSeconds: duration,
        objectCount,
        trafficMultiplier: multiplier,
        backendLatencyMs,
        backendErrorRate,
        cacheCapacityMb,
      };
      await apiClient.startWorkload(config);
      await checkWorkloadStatus();
    } catch (err: any) {
      alert(`Error starting workload: ${err.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTest = async () => {
    try {
      await apiClient.stopWorkload();
      await checkWorkloadStatus();
    } catch (err: any) {
      alert(`Error stopping workload: ${err.message}`);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-amber-400" />
            Traffic Lab & Real Workload Controller
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Generate and stream real reproducible workloads against the AdaptiveCache pipeline
          </p>
        </div>

        {/* Start / Stop Action Button */}
        <div>
          {isWorkloadRunning ? (
            <button
              onClick={handleStopTest}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-rose hover:bg-rose-600 text-white font-bold text-xs font-mono rounded-xl shadow-lg shadow-brand-rose/20 transition-all cursor-pointer"
            >
              <Square className="w-4 h-4 fill-white" />
              STOP WORKLOAD
            </button>
          ) : (
            <button
              onClick={handleStartTest}
              disabled={isStarting}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-xs font-mono rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-stone-950" />
              {isStarting ? 'STARTING...' : 'START TEST'}
            </button>
          )}
        </div>
      </div>

      {/* Preset Scenario Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {scenarioPresets.map((preset) => {
          const isSelected = selectedType === preset.type;
          return (
            <div
              key={preset.type}
              onClick={() => !isWorkloadRunning && handleSelectPreset(preset)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-dark-800 border-amber-500 shadow-md shadow-amber-500/10'
                  : 'bg-dark-900 border-dark-750 hover:border-dark-700'
              } ${isWorkloadRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-stone-100">{preset.name}</span>
                <span className={`text-[10px] font-mono font-bold ${preset.iconColor}`}>
                  {preset.defaultRps} RPS
                </span>
              </div>
              <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed">
                {preset.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Interactive Controls & Real-Time Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1 Col: Sliders Control Panel */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-dark-750">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Workload Parameters
              </span>
            </div>
          </div>

          <div className="space-y-3.5 text-xs font-mono">
            {/* RPS */}
            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Target Request Rate:</span>
                <span className="text-amber-400 font-bold">{rps} RPS</span>
              </div>
              <input
                type="range"
                min="10"
                max="400"
                step="10"
                value={rps}
                disabled={isWorkloadRunning}
                onChange={(e) => setRps(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Multiplier */}
            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Traffic Multiplier:</span>
                <span className="text-orange-400 font-bold">{multiplier.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="4.0"
                step="0.5"
                value={multiplier}
                disabled={isWorkloadRunning}
                onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                className="w-full accent-orange-500 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Object Count */}
            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Catalog Objects:</span>
                <span className="text-stone-100 font-bold">{objectCount} items</span>
              </div>
              <input
                type="range"
                min="20"
                max="300"
                step="10"
                value={objectCount}
                disabled={isWorkloadRunning}
                onChange={(e) => setObjectCount(parseInt(e.target.value, 10))}
                className="w-full accent-amber-400 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Cache Capacity */}
            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Cache Capacity:</span>
                <span className="text-brand-emerald font-bold">{cacheCapacityMb} MB</span>
              </div>
              <input
                type="range"
                min="16"
                max="256"
                step="16"
                value={cacheCapacityMb}
                disabled={isWorkloadRunning}
                onChange={(e) => setCacheCapacityMb(parseInt(e.target.value, 10))}
                className="w-full accent-brand-emerald bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Backend Latency */}
            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Simulated DB Latency:</span>
                <span className="text-amber-400 font-bold">{backendLatencyMs} ms</span>
              </div>
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={backendLatencyMs}
                disabled={isWorkloadRunning}
                onChange={(e) => setBackendLatencyMs(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Backend Error Rate */}
            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Simulated Error Rate:</span>
                <span className="text-brand-rose font-bold">{(backendErrorRate * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={backendErrorRate}
                disabled={isWorkloadRunning}
                onChange={(e) => setBackendErrorRate(parseFloat(e.target.value))}
                className="w-full accent-brand-rose bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Duration */}
            <div>
              <div className="flex justify-between text-stone-300 mb-1">
                <span>Test Duration:</span>
                <span className="text-stone-100 font-bold">{duration} seconds</span>
              </div>
              <input
                type="range"
                min="10"
                max="120"
                step="5"
                value={duration}
                disabled={isWorkloadRunning}
                onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                className="w-full accent-stone-200 bg-dark-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right 2 Cols: Live Execution Telemetry Stream */}
        <div className="lg:col-span-2 space-y-4">
          {/* Real-time Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-dark-900 border border-dark-750 rounded-xl p-3">
              <span className="text-[10px] font-mono text-stone-400 uppercase">Live RPS</span>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                {telemetry?.requestsPerSecond ?? 0}
              </div>
            </div>

            <div className="bg-dark-900 border border-dark-750 rounded-xl p-3">
              <span className="text-[10px] font-mono text-stone-400 uppercase">Cache Hit Rate</span>
              <div className="text-xl font-bold font-mono text-brand-emerald mt-1">
                {telemetry ? `${(telemetry.cacheHitRate * 100).toFixed(1)}%` : '0%'}
              </div>
            </div>

            <div className="bg-dark-900 border border-dark-750 rounded-xl p-3">
              <span className="text-[10px] font-mono text-stone-400 uppercase">Backend Miss Load</span>
              <div className="text-xl font-bold font-mono text-orange-400 mt-1">
                {telemetry ? `${(telemetry.backendLoadRatio * 100).toFixed(1)}%` : '0%'}
              </div>
            </div>

            <div className="bg-dark-900 border border-dark-750 rounded-xl p-3">
              <span className="text-[10px] font-mono text-stone-400 uppercase">Circuit Breaker</span>
              <div className={`text-sm font-bold font-mono mt-1 ${
                telemetry?.circuitBreakerState === 'CLOSED' ? 'text-brand-emerald' : 'text-amber-400'
              }`}>
                {telemetry?.circuitBreakerState || 'CLOSED'}
              </div>
            </div>
          </div>

          {/* Real-time Traffic Graph */}
          <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Live Traffic Stream (RPS & Average Latency)
              </span>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                Real Request Dispatch
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26221f" />
                  <XAxis dataKey="time" stroke="#78716c" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#78716c" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#141210', borderColor: '#332c27', borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line type="monotone" dataKey="rps" name="Incoming RPS" stroke="#FBBF24" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avgLatency" name="Average Latency (ms)" stroke="#EA580C" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
