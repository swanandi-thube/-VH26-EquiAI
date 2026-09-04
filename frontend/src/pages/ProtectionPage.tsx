/**
 * Backend Protection Observability Page (Warm Tech Theme)
 * Live monitoring of Request Coalescing, Circuit Breaker FSM, Token-Bucket Rate Limiting, and Read Replicas.
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  RotateCcw,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Server,
  Database,
  Layers
} from 'lucide-react';
import { MetricCard } from '../components/common/MetricCard';
import { apiClient } from '../api/client';
import { ProtectionStats } from '../types';

export const ProtectionPage: React.FC = () => {
  const [stats, setStats] = useState<ProtectionStats | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await apiClient.getProtectionStats();
      setStats(res);
    } catch (err) {
      console.warn('Error fetching protection stats:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await apiClient.resetProtection();
      await fetchStats();
    } finally {
      setIsResetting(false);
    }
  };

  const getCircuitStateBadge = (state?: string) => {
    switch (state) {
      case 'CLOSED':
        return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-full font-mono font-bold text-xs flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> CLOSED (Healthy)</span>;
      case 'HALF-OPEN':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-full font-mono font-bold text-xs flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> HALF-OPEN (Probing)</span>;
      case 'OPEN':
      default:
        return <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-3 py-1 rounded-full font-mono font-bold text-xs flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> OPEN (Isolated)</span>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-orange-400" />
            Backend Protection & Concurrency Defense
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Singleflight request coalescing, circuit breaker fault-tolerance, and token-bucket traffic shaping
          </p>
        </div>

        <button
          onClick={handleReset}
          disabled={isResetting}
          className="flex items-center gap-2 px-3 py-1.5 bg-dark-850 hover:bg-dark-800 border border-dark-700 text-stone-200 text-xs font-mono rounded-xl transition-colors shrink-0"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          Reset Counters
        </button>
      </div>

      {/* Top Protection Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Requests Collapsed"
          value={stats?.coalescing.requestsCollapsed ?? 0}
          subtitle={`Total Incoming: ${stats?.coalescing.incomingRequests || 0}`}
          icon={Layers}
          iconColor="text-orange-400"
          badge="SINGLEFLIGHT"
          badgeColor="text-orange-300 bg-orange-500/10 border border-orange-500/20"
        />

        <MetricCard
          title="Backend DB Queries"
          value={stats?.coalescing.backendRegenerations ?? 0}
          subtitle="Actual DB regenerations"
          icon={Database}
          iconColor="text-orange-400"
        />

        <MetricCard
          title="Circuit Breaker"
          value={stats?.circuitBreaker.state ?? 'CLOSED'}
          subtitle={`Error Rate: ${stats ? (stats.circuitBreaker.errorRate * 100).toFixed(1) : 0}%`}
          icon={Zap}
          iconColor={stats?.circuitBreaker.state === 'CLOSED' ? 'text-brand-emerald' : 'text-amber-400'}
          badge={stats?.circuitBreaker.state === 'CLOSED' ? 'NORMAL' : 'TRIPPED'}
          badgeColor={stats?.circuitBreaker.state === 'CLOSED' ? 'text-brand-emerald bg-brand-emerald/10 border border-brand-emerald/20' : 'text-brand-rose bg-brand-rose/10 border border-brand-rose/20'}
        />

        <MetricCard
          title="Rate Limiter Tokens"
          value={stats?.rateLimiter.tokensAvailable ?? 250}
          subtitle={`Refill: ${stats?.rateLimiter.refillRateRps || 200} RPS | Throttled: ${stats?.rateLimiter.throttledRequests || 0}`}
          icon={Activity}
          iconColor="text-amber-400"
        />
      </div>

      {/* 2 Main Sections: Request Coalescing Singleflight & Circuit Breaker FSM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module 1: Request Coalescing Deep Dive */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-dark-750">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Singleflight Request Coalescing Engine
              </span>
            </div>
            <span className="text-[10px] font-mono text-orange-300 bg-orange-500/10 px-2.5 py-0.5 rounded-lg border border-orange-500/20">
              Active Protection
            </span>
          </div>

          <p className="text-xs text-stone-300 leading-relaxed">
            When multiple concurrent requests query the exact same uncached key during a cold start or cache stampede, AdaptiveCache coalesces them into a single flight. Only one query reaches PostgreSQL; all other requests await and receive the same shared result.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-2 font-mono text-center">
            <div className="bg-dark-850 p-3 rounded-xl border border-dark-750">
              <div className="text-stone-400 text-[10px] uppercase">Incoming Requests</div>
              <div className="text-xl font-bold text-stone-100 mt-1">{stats?.coalescing.incomingRequests || 0}</div>
            </div>
            <div className="bg-dark-850 p-3 rounded-xl border border-dark-750">
              <div className="text-stone-400 text-[10px] uppercase">DB Regenerations</div>
              <div className="text-xl font-bold text-orange-400 mt-1">{stats?.coalescing.backendRegenerations || 0}</div>
            </div>
            <div className="bg-dark-850 p-3 rounded-xl border border-dark-750">
              <div className="text-stone-400 text-[10px] uppercase">Collapsed Misses</div>
              <div className="text-xl font-bold text-amber-400 mt-1">{stats?.coalescing.requestsCollapsed || 0}</div>
            </div>
          </div>
        </div>

        {/* Module 2: Circuit Breaker State Machine */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-dark-750">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Circuit Breaker Finite State Machine
              </span>
            </div>
            {getCircuitStateBadge(stats?.circuitBreaker.state)}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div className={`p-3 rounded-xl border ${
              stats?.circuitBreaker.state === 'CLOSED'
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300 font-bold'
                : 'bg-dark-850 border-dark-750 text-stone-400'
            }`}>
              <div>CLOSED</div>
              <div className="text-[10px] font-normal mt-1 text-stone-400">Normal Routing</div>
            </div>

            <div className={`p-3 rounded-xl border ${
              stats?.circuitBreaker.state === 'OPEN'
                ? 'bg-rose-500/10 border-rose-500 text-rose-300 font-bold'
                : 'bg-dark-850 border-dark-750 text-stone-400'
            }`}>
              <div>OPEN</div>
              <div className="text-[10px] font-normal mt-1 text-stone-400">Short-Circuiting</div>
            </div>

            <div className={`p-3 rounded-xl border ${
              stats?.circuitBreaker.state === 'HALF-OPEN'
                ? 'bg-amber-500/10 border-amber-500 text-amber-300 font-bold'
                : 'bg-dark-850 border-dark-750 text-stone-400'
            }`}>
              <div>HALF-OPEN</div>
              <div className="text-[10px] font-normal mt-1 text-stone-400">Probing Recovery</div>
            </div>
          </div>

          <div className="text-xs font-mono space-y-1.5 text-stone-300 pt-2 border-t border-dark-800">
            <div className="flex justify-between">
              <span className="text-stone-400">Total Invocations:</span>
              <span>{stats?.circuitBreaker.totalCalls || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Short-Circuited Rejected Calls:</span>
              <span className="text-brand-rose font-bold">{stats?.circuitBreaker.rejectedCalls || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Rolling Error Rate:</span>
              <span className="text-amber-400 font-bold">{stats ? (stats.circuitBreaker.errorRate * 100).toFixed(1) : 0}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Module 3: Read Replicas & Connection Pool Architecture */}
      <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-750">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
              PostgreSQL Multi-Node Cluster & Read Replicas Status
            </span>
          </div>
          <span className="text-[10px] font-mono text-stone-400">
            Active DB Connections: {stats?.pool.activeConnections || 0} / {stats?.pool.maxPoolSize || 20}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats?.replicas.map((node) => (
            <div key={node.id} className="bg-dark-850 border border-dark-700 rounded-xl p-4 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-100 truncate">{node.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20">
                  {node.status}
                </span>
              </div>
              <div className="text-[11px] text-stone-400">Role: <span className="text-stone-200">{node.role}</span></div>
              <div className="text-[11px] text-stone-400">Region: <span className="text-stone-200">{node.region}</span></div>
              <div className="text-[11px] text-stone-400">Replication Lag: <span className="text-amber-400">{node.replicationLagMs} ms</span></div>
              <div className="text-[11px] text-stone-400">Active Query Pool: <span className="text-stone-100 font-bold">{node.activeQueries}</span></div>
              <div className="text-[11px] text-stone-400">CPU Utilization: <span className="text-orange-400 font-bold">{node.cpuUtilizationPercent}%</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
