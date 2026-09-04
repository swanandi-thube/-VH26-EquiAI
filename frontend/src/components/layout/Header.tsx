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
  Square,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Layers,
  ShieldAlert,
  Flame,
  Snowflake,
  TrendingUp,
  Cpu
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
    isDemoRunning,
    activeDemoScenario,
    setDemoMode,
    startDemoScenario,
    stopDemoScenario,
    resetDemoData,
    refreshHealth
  } = useTelemetryContext();

  const [isHealthDropdownOpen, setIsHealthDropdownOpen] = useState(false);
  const [isDemoDropdownOpen, setIsDemoDropdownOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string>('BASIC_CACHE');
  const [isFlushing, setIsFlushing] = useState(false);
  const [isResettingDemo, setIsResettingDemo] = useState(false);

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

  const handleRunDemoScenario = async () => {
    try {
      await startDemoScenario(selectedScenario);
      await refreshHealth();
    } catch (err) {
      console.error('Failed to run demo scenario:', err);
    }
  };

  const handleResetDemo = async () => {
    if (confirm('Reset demo mode? This will purge ONLY demo Redis keys (adaptivecache:demo:*) and demo logs, leaving live production data untouched.')) {
      setIsResettingDemo(true);
      try {
        await resetDemoData();
        await refreshHealth();
      } finally {
        setIsResettingDemo(false);
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

        {/* Mode Indicators */}
        <div className="hidden md:flex items-center gap-2 pl-3 border-l border-dark-750">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-850 border border-dark-700">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-brand-emerald animate-pulse' : 'bg-brand-rose'}`} />
            <span className="text-xs font-mono font-semibold tracking-wider text-stone-300">
              {isConnected ? 'STREAM CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          {/* Explicit Mode State Badge */}
          {isDemoMode ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold animate-pulse">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>DEMO MODE — TEST DATA</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>LIVE MODE — REAL DATA</span>
            </div>
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

        {/* Demo Mode / Scenario Runner Control */}
        <div className="relative">
          <div className="flex items-center gap-1">
            {/* Main Demo/Live Toggle Button */}
            <button
              onClick={() => {
                const nextMode = !isDemoMode;
                setDemoMode(nextMode);
                if (nextMode) {
                  setIsDemoDropdownOpen(true);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold border transition-all ${
                isDemoMode
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm shadow-amber-500/20'
                  : 'bg-dark-850 hover:bg-dark-800 border-dark-700 text-stone-400 hover:text-stone-200'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isDemoMode ? 'text-amber-400 animate-spin' : 'text-stone-400'}`} />
              <span>{isDemoMode ? 'DEMO MODE' : 'LIVE MODE'}</span>
            </button>

            {/* Quick Demo Scenario Trigger Button if Demo Mode is active */}
            {isDemoMode && (
              <button
                onClick={() => setIsDemoDropdownOpen(!isDemoDropdownOpen)}
                className="p-1 text-amber-400 hover:bg-dark-800 rounded-md border border-amber-500/40 bg-dark-850 transition-colors"
                title="Demo Scenario Runner"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Demo Scenario Runner Dropdown */}
          {isDemoMode && isDemoDropdownOpen && (
            <div className="absolute right-0 mt-2 w-96 bg-dark-900 border border-amber-500/40 rounded-xl shadow-2xl p-4 z-50 animate-fadeIn text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-dark-750 mb-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-stone-200 uppercase tracking-wider">Demo Test Harness</span>
                </div>
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                  adaptivecache:demo:*
                </span>
              </div>

              <p className="text-stone-400 text-[11px] mb-3 leading-relaxed">
                Deterministic test fixtures (<span className="text-stone-300 font-mono">DEMO-001..DEMO-010</span>) executed through the real cache pipeline, multi-factor decision engine, and telemetry recorder.
              </p>

              {/* Scenario Selector */}
              <div className="space-y-1.5 mb-3">
                <label className="text-[11px] font-semibold text-stone-300 uppercase tracking-wider">Select Test Scenario</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  disabled={isDemoRunning}
                  className="w-full bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-stone-200 font-mono focus:border-amber-500 outline-none"
                >
                  <option value="BASIC_CACHE">1. Basic Cache (Miss -&gt; Hit Flow)</option>
                  <option value="HOT_OBJECT">2. Hot Object (Elevation &amp; Dynamic TTL)</option>
                  <option value="COLD_OBJECT">3. Cold Object (Low Frequency Retention)</option>
                  <option value="CACHE_PRESSURE">4. Cache Pressure (12KB Eviction Decision)</option>
                  <option value="TRAFFIC_SPIKE">5. Traffic Spike (3x Multiplier Trace)</option>
                  <option value="BACKEND_DEGRADATION">6. Backend Degradation (300ms + Circuit Breaker)</option>
                </select>
              </div>

              {/* Scenario Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-dark-750">
                <button
                  onClick={handleRunDemoScenario}
                  disabled={isDemoRunning}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-1.5 px-3 rounded-lg transition-colors font-mono disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${isDemoRunning ? 'animate-spin' : ''}`} />
                  <span>{isDemoRunning ? 'Executing...' : 'Run Scenario'}</span>
                </button>

                {isDemoRunning && (
                  <button
                    onClick={stopDemoScenario}
                    className="flex items-center gap-1 bg-dark-800 hover:bg-dark-750 text-brand-rose border border-rose-500/30 font-semibold py-1.5 px-2.5 rounded-lg transition-colors font-mono"
                    title="Stop Workload"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                )}

                <button
                  onClick={handleResetDemo}
                  disabled={isResettingDemo || isDemoRunning}
                  className="flex items-center gap-1 bg-dark-800 hover:bg-dark-750 text-stone-300 hover:text-amber-300 border border-dark-700 font-medium py-1.5 px-2.5 rounded-lg transition-colors font-mono"
                  title="Reset demo Redis namespace and demo records only"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isResettingDemo ? 'animate-spin' : ''}`} />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Flush Live Cache Action */}
        <button
          onClick={handleFlushCache}
          disabled={isFlushing}
          title="Flush Live Redis Cache and Reset Telemetry"
          className="p-1.5 text-stone-400 hover:text-brand-rose hover:bg-dark-800 rounded-lg border border-dark-750 transition-colors"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
};

