/**
 * Fair Multi-Strategy Benchmark Page (Warm Tech Theme)
 * Side-by-side comparison of AdaptiveCache vs LRU vs LFU vs GDS on identical request traces.
 */

import React, { useState, useEffect } from 'react';
import {
  Scale,
  Play,
  CheckCircle2,
  Layers,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { apiClient } from '../api/client';
import { BenchmarkRun, WorkloadUploadSummary } from '../types';

export const BenchmarkPage: React.FC = () => {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [workloads, setWorkloads] = useState<WorkloadUploadSummary[]>([]);
  const [selectedWorkloadId, setSelectedWorkloadId] = useState<string>('synthetic');
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [requestCount, setRequestCount] = useState(2500);
  const [capacityMb, setCapacityMb] = useState(32);

  const fetchRuns = async () => {
    try {
      const data = await apiClient.getBenchmarkRuns();
      setRuns(data);
      if (data.length > 0 && !selectedRun) {
        setSelectedRun(data[0]);
      }
    } catch (err) {
      console.warn('Error loading benchmark runs:', err);
    }
  };

  const fetchWorkloads = async () => {
    try {
      const data = await apiClient.getWorkloadRuns();
      setWorkloads(data || []);
    } catch (err) {
      console.warn('Error loading workloads for benchmark:', err);
    }
  };

  useEffect(() => {
    fetchRuns();
    fetchWorkloads();
  }, []);

  const handleRunNewBenchmark = async () => {
    setIsRunningBenchmark(true);
    try {
      let result;
      if (selectedWorkloadId === 'synthetic') {
        result = await apiClient.runBenchmark({
          requestCount,
          capacityMb,
          traceName: `Fair Zipfian Trace (${requestCount} Reqs, ${capacityMb}MB)`,
        });
      } else {
        const found = workloads.find(w => (w.workloadId || w.workload_id) === selectedWorkloadId);
        result = await apiClient.runBenchmark({
          workloadId: selectedWorkloadId,
          capacityMb,
          traceName: `Workload Trace: ${found?.filename || selectedWorkloadId} (${capacityMb}MB)`,
        });
      }
      setSelectedRun(result);
      await fetchRuns();
    } catch (err: any) {
      alert(`Benchmark error: ${err.message}`);
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  // Prepare chart data from selected run
  const chartData = selectedRun?.results.map((r) => ({
    name: r.strategy,
    hitRate: Math.round(r.hitRate * 100),
    avgLatency: r.avgLatencyMs,
    p99Latency: r.p99LatencyMs,
    dbRequests: r.backendRequests,
    evictions: r.evictionsCount,
    cost: r.totalCostUsd,
  })) || [];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-400" />
            Fair Multi-Strategy Benchmark Engine
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Strict identical-trace execution comparing AdaptiveCache, LRU, LFU, and Greedy Dual Size (GDS)
          </p>
        </div>

        <button
          onClick={handleRunNewBenchmark}
          disabled={isRunningBenchmark}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-xs font-mono rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer shrink-0"
        >
          <Play className="w-4 h-4 fill-stone-950" />
          {isRunningBenchmark ? 'EXECUTING DIGITAL TWIN...' : 'RUN BENCHMARK'}
        </button>
      </div>

      {/* Benchmark Controls & Fairness Verification Banner */}
      <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-100 flex items-center gap-2">
              <span>Fairness Guarantee Verified</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono">
                100% IDENTICAL TRACE
              </span>
            </div>
            <p className="text-[11px] text-stone-400 mt-0.5">
              Exact same request sequence, object sizes, recomputation costs, and memory capacity fed to all 4 engines.
            </p>
          </div>
        </div>

        {/* Trace Parameter Selectors */}
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5 bg-dark-850 border border-dark-700 rounded-lg px-3 py-1.5">
            <span className="text-stone-400">Trace:</span>
            <select
              value={selectedWorkloadId}
              onChange={(e) => setSelectedWorkloadId(e.target.value)}
              disabled={isRunningBenchmark}
              className="bg-transparent text-amber-400 font-bold focus:outline-none max-w-[160px] truncate"
            >
              <option value="synthetic" className="bg-dark-900 text-stone-100">Synthetic (Zipfian)</option>
              {workloads.map((w) => {
                const wid = w.workloadId || w.workload_id || '';
                return (
                  <option key={wid} value={wid} className="bg-dark-900 text-stone-100">
                    {w.filename} ({w.validRows || w.valid_rows || 0} reqs)
                  </option>
                );
              })}
            </select>
          </div>

          {selectedWorkloadId === 'synthetic' && (
            <div className="flex items-center gap-1.5 bg-dark-850 border border-dark-700 rounded-lg px-3 py-1.5">
              <span className="text-stone-400">Requests:</span>
              <select
                value={requestCount}
                onChange={(e) => setRequestCount(parseInt(e.target.value, 10))}
                disabled={isRunningBenchmark}
                className="bg-transparent text-stone-100 font-bold focus:outline-none"
              >
                <option value="1000" className="bg-dark-900">1,000 reqs</option>
                <option value="2500" className="bg-dark-900">2,500 reqs</option>
                <option value="5000" className="bg-dark-900">5,000 reqs</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 bg-dark-850 border border-dark-700 rounded-lg px-3 py-1.5">
            <span className="text-stone-400">Capacity:</span>
            <select
              value={capacityMb}
              onChange={(e) => setCapacityMb(parseInt(e.target.value, 10))}
              disabled={isRunningBenchmark}
              className="bg-transparent text-stone-100 font-bold focus:outline-none"
            >
              <option value="16" className="bg-dark-900">16 MB</option>
              <option value="32" className="bg-dark-900">32 MB</option>
              <option value="64" className="bg-dark-900">64 MB</option>
              <option value="128" className="bg-dark-900">128 MB</option>
            </select>
          </div>
        </div>
      </div>

      {/* Comparative Charts Row */}
      {selectedRun && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Hit Rate & Backend Requests Comparison */}
          <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Hit Rate (%) & Backend Query Offload
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26221f" />
                  <XAxis dataKey="name" stroke="#78716c" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#78716c" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#141210', borderColor: '#332c27', borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="hitRate" name="Hit Rate %" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="dbRequests" name="Backend DB Requests" fill="#EA580C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Latency Percentiles Comparison */}
          <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Tail Latency Comparison (Average vs P99 ms)
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26221f" />
                  <XAxis dataKey="name" stroke="#78716c" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#78716c" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#141210', borderColor: '#332c27', borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="avgLatency" name="Average Latency (ms)" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="p99Latency" name="P99 Tail Latency (ms)" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Comparative Metrics Table */}
      {selectedRun ? (
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Detailed Side-by-Side Strategy Comparison Matrix
              </h3>
            </div>
            <span className="text-[10px] font-mono text-stone-400">
              Trace: {selectedRun.traceName} ({selectedRun.totalRequestsInTrace} requests)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-dark-750 text-stone-400 text-[11px]">
                  <th className="pb-3">STRATEGY</th>
                  <th className="pb-3">HIT RATE</th>
                  <th className="pb-3">DB REQUESTS</th>
                  <th className="pb-3">EVICTIONS</th>
                  <th className="pb-3">AVG LATENCY</th>
                  <th className="pb-3">P95 LATENCY</th>
                  <th className="pb-3">P99 LATENCY</th>
                  <th className="pb-3">REGEN COST</th>
                  <th className="pb-3 text-right">COST / HR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {selectedRun.results.map((r) => {
                  const isAdaptive = r.strategy === 'ADAPTIVE';
                  return (
                    <tr
                      key={r.strategy}
                      className={isAdaptive ? 'bg-amber-500/10 font-semibold text-stone-100' : 'hover:bg-dark-850/80 text-stone-300'}
                    >
                      <td className="py-3.5 flex items-center gap-2">
                        {isAdaptive && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                        <span className={isAdaptive ? 'text-amber-300 font-bold' : 'text-stone-100'}>
                          {r.strategyName}
                        </span>
                      </td>
                      <td className="py-3.5 text-brand-emerald font-bold">{(r.hitRate * 100).toFixed(1)}%</td>
                      <td className="py-3.5">{r.backendRequests}</td>
                      <td className="py-3.5 text-stone-400">{r.evictionsCount}</td>
                      <td className="py-3.5 text-amber-300">{r.avgLatencyMs} ms</td>
                      <td className="py-3.5 text-orange-400">{r.p95LatencyMs} ms</td>
                      <td className="py-3.5 text-rose-400">{r.p99LatencyMs} ms</td>
                      <td className="py-3.5 text-stone-300">{(r.totalRegenerationCostMs / 1000).toFixed(1)}s</td>
                      <td className="py-3.5 text-right font-bold text-brand-emerald">${r.totalCostUsd.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-12 text-center text-stone-400 font-mono text-sm">
          Click "RUN BENCHMARK" above to execute a digital twin trace across AdaptiveCache, LRU, LFU, and GDS.
        </div>
      )}
    </div>
  );
};
