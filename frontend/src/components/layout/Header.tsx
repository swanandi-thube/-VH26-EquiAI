/**
 * Observability Platform Header (Warm Tech Theme)
 * Live connection status, component health dropdown, RPS ticker, and workload status.
 */

import React, { useState } from 'react';
import {
  Activity,
  Server,
  Database,
  Radio,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCcw,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { useTelemetryContext } from '../../context/TelemetryContext';
import { apiClient } from '../../api/client';

export const Header: React.FC = () => {
  const {
    telemetry,
    isConnected,
    health,
    isWorkloadRunning,
    activeWorkload,
    isDemoMode,
    setDemoMode,
    refreshHealth
  } = useTelemetryContext();

  const [isHealthDropdownOpen, setIsHealthDropdownOpen] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);

  const handleFlushCache = async () => {
    if (confirm('Are you sure you want to flush all Redis cache objects and reset telemetry counters?')) {
      setIsFlushing(true);
      try {
        await apiClient.flushCache();
        await refreshHealth();
      } finally {
        setIsFlushing(false);
      }
    }
  };

  const getHealthBadge = (status?: string) => {
    switch (status) {
      case 'CONNECTED':
        return <span className="inline-flex items-center gap-1 text-xs text-brand-emerald bg-brand-emerald/10 px-2 py-0.5 rounded border border-brand-emerald/20 font-mono"><CheckCircle2 className="w-3 h-3" /> CONNECTED</span>;
      case 'DEGRADED':
        return <span className="inline-flex items-center gap-1 text-xs text-brand-amber bg-brand-amber/10 px-2 py-0.5 rounded border border-brand-amber/20 font-mono"><AlertTriangle className="w-3 h-3" /> DEGRADED</span>;
      case 'OFFLINE':
      default:
        return <span className="inline-flex items-center gap-1 text-xs text-brand-rose bg-brand-rose/10 px-2 py-0.5 rounded border border-brand-rose/20 font-mono"><XCircle className="w-3 h-3" /> OFFLINE</span>;
    }
  };

  return (
    <header className="h-14 bg-dark-900 border-b border-dark-750 px-4 flex items-center justify-between z-30 sticky top-0">
      {/* Brand & System Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Zap className="w-4 h-4 text-stone-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-wider bg-gradient-to-r from-amber-100 via-amber-200 to-amber-400 bg-clip-text text-transparent">
                ADAPTIVECACHE
              </span>
              <span className="text-[10px] bg-dark-800 text-amber-400 px-1.5 py-0.5 rounded font-mono border border-amber-500/30">
                v2.0
              </span>
            </div>
          </div>
        </div>

        {/* Live Indicator */}
        <div className="hidden md:flex items-center gap-2 pl-3 border-l border-dark-750">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-850 border border-dark-700">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-brand-emerald animate-pulse' : 'bg-brand-rose'}`} />
            <span className="text-xs font-mono font-semibold tracking-wider text-stone-300">
              {isConnected ? 'LIVE' : 'DISCONNECTED'}
            </span>
          </div>

          {isDemoMode && (
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-mono font-bold animate-pulse">
              DEMO MODE
            </span>
          )}

          {isWorkloadRunning && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
              <Play className="w-3 h-3 animate-spin text-amber-400" />
              <span>TRAFFIC LAB: {activeWorkload?.config.type.replace('_', ' ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Metrics Ticker & System Controls */}
      <div className="flex items-center gap-3">
        {/* Real-time RPS */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-dark-850 border border-dark-750 rounded-lg text-xs font-mono">
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-stone-400">RPS:</span>
          <span className="text-stone-100 font-bold">{telemetry?.requestsPerSecond ?? '0.0'}</span>
        </div>

        {/* Real-time Hit Rate */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-dark-850 border border-dark-750 rounded-lg text-xs font-mono">
          <Radio className="w-3.5 h-3.5 text-brand-emerald" />
          <span className="text-stone-400">Hit Rate:</span>
          <span className="text-brand-emerald font-bold">
            {telemetry ? `${(telemetry.cacheHitRate * 100).toFixed(1)}%` : '0.0%'}
          </span>
        </div>

        {/* System Health Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsHealthDropdownOpen(!isHealthDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1 bg-dark-850 hover:bg-dark-800 border border-dark-700 rounded-lg text-xs font-mono transition-colors text-stone-200"
          >
            <Server className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden sm:inline text-stone-400">System:</span>
            <span className="font-semibold text-stone-200">{health?.overall || 'CONNECTED'}</span>
            <ChevronDown className="w-3 h-3 text-stone-400" />
          </button>

          {isHealthDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-dark-900 border border-dark-700 rounded-xl shadow-2xl p-3 z-50 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-dark-750 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-300">Component Health Status</span>
                <span className="text-[10px] font-mono text-stone-400">
                  {new Date(health?.timestamp || Date.now()).toLocaleTimeString()}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 flex items-center gap-1.5"><Database className="w-3 h-3 text-rose-400" /> Redis Cache:</span>
                  {getHealthBadge(health?.components.redis.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 flex items-center gap-1.5"><Database className="w-3 h-3 text-orange-400" /> PostgreSQL DB:</span>
                  {getHealthBadge(health?.components.postgres.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 flex items-center gap-1.5"><Server className="w-3 h-3 text-emerald-400" /> Backend REST API:</span>
                  {getHealthBadge(health?.components.backendApi.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 flex items-center gap-1.5"><Zap className="w-3 h-3 text-amber-400" /> Decision Engine:</span>
                  {getHealthBadge(health?.components.decisionEngine.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 flex items-center gap-1.5"><Radio className="w-3 h-3 text-amber-500" /> WebSocket Stream:</span>
                  {getHealthBadge(health?.components.webSocket.status)}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-dark-750 flex justify-between items-center text-[10px] text-stone-400">
                <span>Auto-checks every 5s</span>
                <button
                  onClick={refreshHealth}
                  className="text-amber-400 hover:text-amber-300 hover:underline"
                >
                  Refresh Now
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Flush Cache Action */}
        <button
          onClick={handleFlushCache}
          disabled={isFlushing}
          title="Flush Redis Cache and Reset Telemetry"
          className="p-1.5 text-stone-400 hover:text-brand-rose hover:bg-dark-800 rounded-lg border border-dark-750 transition-colors"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
        </button>

        {/* Demo Mode Toggle */}
        <button
          onClick={() => setDemoMode(!isDemoMode)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors ${
            isDemoMode
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10'
              : 'bg-dark-850 hover:bg-dark-800 border-dark-700 text-stone-400 hover:text-stone-200'
          }`}
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span className="hidden sm:inline">Demo Mode</span>
        </button>
      </div>
    </header>
  );
};
