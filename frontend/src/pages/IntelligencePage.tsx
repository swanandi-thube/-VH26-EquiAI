/**
 * Cache Intelligence Page (Warm Tech Theme)
 * Deep-dive analysis of cache residency, score distributions, decision breakdowns,
 * and complete interactive cache object table.
 */

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Zap,
  Search,
  Layers,
  Sparkles,
  PieChart as PieIcon,
  BarChart3,
  HardDrive,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { useTelemetryContext } from '../context/TelemetryContext';
import { MetricCard } from '../components/common/MetricCard';
import { apiClient } from '../api/client';
import { CacheObjectMetadata } from '../types';

export const IntelligencePage: React.FC = () => {
  const { telemetry, openExplainDrawer } = useTelemetryContext();
  const [objects, setObjects] = useState<CacheObjectMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDecisionFilter, setSelectedDecisionFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);

  const fetchObjects = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.getCacheObjects();
      setObjects(res.objects);
    } catch (err) {
      console.warn('Error fetching cache objects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchObjects();
    const interval = setInterval(fetchObjects, 4000);
    return () => clearInterval(interval);
  }, []);

  // Filtered objects
  const filteredObjects = objects.filter((obj) => {
    const matchesSearch = obj.objectId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          obj.key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedDecisionFilter === 'ALL' || obj.lastDecision === selectedDecisionFilter;
    return matchesSearch && matchesFilter;
  });

  // Decision distribution data for Pie Chart
  const decisionCounts = {
    KEEP: objects.filter(o => o.lastDecision === 'KEEP').length,
    REFRESH: objects.filter(o => o.lastDecision === 'REFRESH').length,
    PRE_CACHE: objects.filter(o => o.lastDecision === 'PRE-CACHE' || o.isPreCached).length,
    EVICT: telemetry?.evictionsCount || 0,
  };

  const decisionPieData = [
    { name: 'KEEP', value: decisionCounts.KEEP, color: '#10B981' },
    { name: 'REFRESH', value: decisionCounts.REFRESH, color: '#F59E0B' },
    { name: 'PRE-CACHE', value: decisionCounts.PRE_CACHE, color: '#EA580C' },
    { name: 'EVICTIONS', value: decisionCounts.EVICT, color: '#EF4444' },
  ].filter(d => d.value > 0);

  // Object Popularity Histogram (Top 10 accessed objects)
  const popularityData = [...objects]
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 10)
    .map(o => ({
      name: o.objectId.replace('Product_', 'P-'),
      accesses: o.accessCount,
      score: Math.round(o.adaptiveScore * 100),
      cost: o.retrievalCostMs,
    }));

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'PRE-CACHE':
        return <span className="bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">PRE-CACHE</span>;
      case 'REFRESH':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">REFRESH</span>;
      case 'EVICT':
        return <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">EVICT</span>;
      case 'KEEP':
      default:
        return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">KEEP</span>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-400" />
            Cache Intelligence & Object Residency
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Application-aware multi-factor memory state, dynamic lifecycle decisions, and demand predictions
          </p>
        </div>

        <button
          onClick={fetchObjects}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 bg-dark-850 hover:bg-dark-800 border border-dark-700 text-stone-200 text-xs font-mono rounded-xl transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Registry
        </button>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Cached Objects"
          value={telemetry?.cachedObjectsCount ?? 0}
          subtitle={`Capacity: ${telemetry ? (telemetry.memoryCapacityBytes / (1024 * 1024)).toFixed(0) : '64'} MB`}
          icon={HardDrive}
          iconColor="text-amber-400"
        />

        <MetricCard
          title="Pre-Cache Operations"
          value={telemetry?.preCacheCount ?? 0}
          subtitle="Proactive warming triggers"
          icon={Sparkles}
          iconColor="text-orange-400"
        />

        <MetricCard
          title="Dynamic Refreshes"
          value={telemetry?.refreshesCount ?? 0}
          subtitle="Pre-expiration renewals"
          icon={RefreshCw}
          iconColor="text-brand-emerald"
        />

        <MetricCard
          title="Memory Evictions"
          value={telemetry?.evictionsCount ?? 0}
          subtitle="Capacity space claims"
          icon={Zap}
          iconColor="text-brand-rose"
        />
      </div>

      {/* Intelligence Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Object Popularity Distribution */}
        <div className="lg:col-span-2 bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Top Object Accesses & Adaptive Scores
              </span>
            </div>
            <span className="text-[10px] font-mono text-stone-400 bg-dark-850 px-2.5 py-0.5 rounded-lg border border-dark-750">
              Zipfian Access Distribution
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={popularityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#26221f" />
                <XAxis dataKey="name" stroke="#78716c" tick={{ fontSize: 10 }} />
                <YAxis stroke="#78716c" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#141210', borderColor: '#332c27', borderRadius: '8px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="accesses" name="Access Count" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                <Bar dataKey="score" name="Adaptive Score (x100)" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Decision Distribution Pie */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Decision Breakdown
              </span>
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {decisionPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={decisionPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {decisionPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#141210', borderColor: '#332c27', borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-stone-400 font-mono">No decision data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Full Live Cache Registry Table */}
      <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-200">
              Live Redis Cache Registry ({filteredObjects.length} objects)
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search object ID or key..."
                className="bg-dark-850 border border-dark-700 rounded-lg pl-8 pr-3 py-1 text-xs text-stone-200 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Decision Filter */}
            <div className="flex items-center gap-1 bg-dark-850 border border-dark-700 rounded-lg p-0.5 text-xs font-mono">
              {['ALL', 'KEEP', 'REFRESH', 'PRE-CACHE'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedDecisionFilter(filter)}
                  className={`px-2.5 py-0.5 rounded-md transition-colors ${
                    selectedDecisionFilter === filter
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-dark-750 text-stone-400 text-[11px]">
                <th className="pb-3">OBJECT ID</th>
                <th className="pb-3">SIZE</th>
                <th className="pb-3">ACCESS COUNT</th>
                <th className="pb-3">RETRY COST</th>
                <th className="pb-3">PREDICTED DEMAND</th>
                <th className="pb-3">ADAPTIVE SCORE</th>
                <th className="pb-3">DECISION</th>
                <th className="pb-3">TTL REMAINING</th>
                <th className="pb-3 text-right">INSPECT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {filteredObjects.length > 0 ? (
                filteredObjects.map((obj) => (
                  <tr
                    key={obj.objectId}
                    className="hover:bg-dark-850/80 transition-colors cursor-pointer group"
                    onClick={() => openExplainDrawer(`DEC-${obj.objectId}`)}
                  >
                    <td className="py-2.5 font-bold text-stone-100 group-hover:text-amber-400">{obj.objectId}</td>
                    <td className="py-2.5 text-stone-300">{(obj.sizeBytes / 1024).toFixed(1)} KB</td>
                    <td className="py-2.5 text-amber-300 font-bold">{obj.accessCount}</td>
                    <td className="py-2.5 text-orange-400">{obj.retrievalCostMs}ms</td>
                    <td className="py-2.5">
                      <span className={obj.predictedDemand >= 0 ? 'text-brand-emerald' : 'text-brand-rose'}>
                        {obj.predictedDemand >= 0 ? `+${Math.round(obj.predictedDemand * 100)}%` : `${Math.round(obj.predictedDemand * 100)}%`}
                      </span>
                    </td>
                    <td className="py-2.5 font-bold text-stone-100">{(obj.adaptiveScore || 0.5).toFixed(2)}</td>
                    <td className="py-2.5">{getDecisionBadge(obj.lastDecision)}</td>
                    <td className="py-2.5 text-brand-emerald font-semibold">{obj.remainingTtlSeconds}s</td>
                    <td className="py-2.5 text-right">
                      <span className="text-[11px] text-amber-400 inline-flex items-center gap-0.5 group-hover:underline">
                        Explain <ChevronRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-400">
                    No matching cache objects found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
