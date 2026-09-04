/**
 * Dashboard Page - System Overview & Real-Time Telemetry
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Radio,
  Server,
  Clock,
  HardDrive,
  Cpu,
  Zap,
  TrendingUp,
  Play,
  RotateCcw,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { useTelemetryContext } from '../context/TelemetryContext';
import { MetricCard } from '../components/common/MetricCard';
import { ArchitectureFlow } from '../components/common/ArchitectureFlow';
import { apiClient } from '../api/client';
import { CacheObjectMetadata, DecisionRecord } from '../types';

export const DashboardPage: React.FC = () => {
  const { telemetry, history, openExplainDrawer } = useTelemetryContext();
  const [topObjects, setTopObjects] = useState<CacheObjectMetadata[]>([]);
  const [recentDecisions, setRecentDecisions] = useState<DecisionRecord[]>([]);

  const fetchDashboardData = async () => {
    try {
      const [objsRes, decsRes] = await Promise.all([
        apiClient.getCacheObjects(),
        apiClient.getDecisions(6),
      ]);
      setTopObjects(objsRes.objects.slice(0, 6));
      setRecentDecisions(decsRes);
    } catch (err) {
      console.warn('Error fetching dashboard tables:', err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, []);

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'PRE-CACHE':
        return <span className="bg-brand-purple/20 text-brand-purple border border-brand-purple/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">PRE-CACHE</span>;
      case 'REFRESH':
        return <span className="bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">REFRESH</span>;
      case 'EVICT':
        return <span className="bg-brand-rose/20 text-brand-rose border border-brand-rose/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">EVICT</span>;
      case 'KEEP':
      default:
        return <span className="bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">KEEP</span>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Top 8 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Current Hit Rate"
          value={telemetry ? `${(telemetry.cacheHitRate * 100).toFixed(1)}%` : '0.0%'}
          subtitle={`Hits: ${telemetry?.cacheHits || 0} / Misses: ${telemetry?.cacheMisses || 0}`}
          icon={Radio}
          iconColor="text-brand-emerald"
          badge={telemetry && telemetry.cacheHitRate > 0.7 ? 'OPTIMAL' : 'WARMING'}
          badgeColor={telemetry && telemetry.cacheHitRate > 0.7 ? 'text-brand-emerald bg-brand-emerald/10' : 'text-brand-amber bg-brand-amber/10'}
        />

        <MetricCard
          title="Backend Load"
          value={telemetry ? `${(telemetry.backendLoadRatio * 100).toFixed(1)}%` : '0.0%'}
          subtitle={`DB Requests: ${telemetry?.backendRequests || 0}`}
          icon={Server}
          iconColor="text-blue-400"
          badge={telemetry && telemetry.backendLoadRatio < 0.3 ? 'PROTECTED' : 'HIGH LOAD'}
          badgeColor={telemetry && telemetry.backendLoadRatio < 0.3 ? 'text-brand-emerald bg-brand-emerald/10' : 'text-brand-amber bg-brand-amber/10'}
        />

        <MetricCard
          title="Request Velocity"
          value={telemetry?.requestsPerSecond ?? 0}
          unit="RPS"
          subtitle={`Total: ${telemetry?.totalRequests || 0} reqs`}
          icon={Activity}
          iconColor="text-brand-cyan"
        />

        <MetricCard
          title="Average Latency"
          value={telemetry?.averageLatencyMs ?? 0}
          unit="ms"
          subtitle={`P50: ${telemetry?.p50LatencyMs || 0}ms`}
          icon={Clock}
          iconColor="text-brand-purple"
        />

        <MetricCard
          title="P95 Latency"
          value={telemetry?.p95LatencyMs ?? 0}
          unit="ms"
          subtitle="95% under threshold"
          icon={Clock}
          iconColor="text-amber-400"
        />

        <MetricCard
          title="P99 Latency"
          value={telemetry?.p99LatencyMs ?? 0}
          unit="ms"
          subtitle="Tail latency metric"
          icon={Clock}
          iconColor="text-rose-400"
        />

        <MetricCard
          title="Cache Memory"
          value={telemetry ? (telemetry.memoryUsedBytes / (1024 * 1024)).toFixed(1) : '0'}
          unit="MB"
          subtitle={`Capacity: ${telemetry ? (telemetry.memoryCapacityBytes / (1024 * 1024)).toFixed(0) : '64'} MB`}
          icon={HardDrive}
          iconColor="text-brand-cyan"
          badge={`${telemetry ? (telemetry.memoryUtilizationRatio * 100).toFixed(0) : '0'}% UTIL`}
        />

        <MetricCard
          title="Active Objects"
          value={telemetry?.cachedObjectsCount ?? 0}
          subtitle={`Evictions: ${telemetry?.evictionsCount || 0} | Pre-cached: ${telemetry?.preCacheCount || 0}`}
          icon={Cpu}
          iconColor="text-brand-blue"
        />
      </div>

      {/* Live Architecture Flow */}
      <ArchitectureFlow />

      {/* Real-Time Telemetry Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Hit Rate & Backend Load */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Radio className="w-4 h-4 text-brand-emerald" />
                Cache Hit Rate vs Backend Load (Live %)
              </h3>
              <p className="text-[11px] text-slate-400">Continuous rolling telemetry stream</p>
            </div>
            <span className="text-[10px] font-mono text-brand-emerald bg-brand-emerald/10 px-2 py-0.5 rounded border border-brand-emerald/20">
              4 Hz Stream
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="hitRateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="time" stroke="#64748B" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} stroke="#64748B" tick={{ fontSize: 10 }} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0B0F17', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Area type="monotone" dataKey="hitRate" name="Cache Hit Rate %" stroke="#10B981" fillOpacity={1} fill="url(#hitRateGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="backendLoad" name="Backend DB Load %" stroke="#3B82F6" fillOpacity={1} fill="url(#loadGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Latency Percentiles (Avg, P95, P99) */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-purple" />
                Latency Distribution (Avg / P95 / P99 ms)
              </h3>
              <p className="text-[11px] text-slate-400">Calculated from actual recorded request arrays</p>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-dark-850 px-2 py-0.5 rounded border border-dark-750">
              Percentiles
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="time" stroke="#64748B" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748B" tick={{ fontSize: 10 }} unit="ms" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0B0F17', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="avgLatency" name="Average Latency" stroke="#00F0FF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="p95Latency" name="P95 Latency" stroke="#F59E0B" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="p99Latency" name="P99 Latency" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tables: Recent Decisions & Top Cached Objects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Decisions Table */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-cyan" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Recent Adaptive Decisions (Click for Explainability)
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-dark-750 text-slate-400 text-[11px]">
                  <th className="pb-2">OBJECT</th>
                  <th className="pb-2">DECISION</th>
                  <th className="pb-2">SCORE</th>
                  <th className="pb-2">TTL</th>
                  <th className="pb-2 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {recentDecisions.length > 0 ? (
                  recentDecisions.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => openExplainDrawer(d.id)}
                      className="hover:bg-dark-850/80 cursor-pointer transition-colors group"
                    >
                      <td className="py-2.5 font-bold text-white group-hover:text-brand-cyan">{d.objectId}</td>
                      <td className="py-2.5">{getDecisionBadge(d.decisionType)}</td>
                      <td className="py-2.5 text-brand-cyan">{d.adaptiveScore.toFixed(2)}</td>
                      <td className="py-2.5 text-slate-300">{d.newTtl}s</td>
                      <td className="py-2.5 text-right">
                        <span className="text-[11px] text-brand-cyan inline-flex items-center gap-0.5 group-hover:underline">
                          Explain <ChevronRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No decisions recorded yet. Run a workload in Traffic Lab to observe live decisions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Cached Objects Table */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-brand-blue" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Top Active Objects in Redis Cache
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-dark-750 text-slate-400 text-[11px]">
                  <th className="pb-2">OBJECT ID</th>
                  <th className="pb-2">SIZE</th>
                  <th className="pb-2">RETRY COST</th>
                  <th className="pb-2">ACCESSES</th>
                  <th className="pb-2 text-right">TTL LEFT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {topObjects.length > 0 ? (
                  topObjects.map((obj) => (
                    <tr key={obj.objectId} className="hover:bg-dark-850/80 transition-colors">
                      <td className="py-2.5 font-bold text-white">{obj.objectId}</td>
                      <td className="py-2.5 text-slate-300">{(obj.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td className="py-2.5 text-amber-400">{obj.retrievalCostMs}ms</td>
                      <td className="py-2.5 text-brand-cyan font-bold">{obj.accessCount}</td>
                      <td className="py-2.5 text-right text-brand-emerald">{obj.remainingTtlSeconds}s</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      Cache is currently empty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
