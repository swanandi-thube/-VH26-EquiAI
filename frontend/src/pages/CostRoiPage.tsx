/**
 * Transparent Cost & ROI Page
 * Real formula-based cloud infrastructure cost breakdown, net savings, and assumptions config.
 */

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  Sliders,
  Check,
  Server,
  Database,
  HardDrive,
  Globe,
  Info,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { MetricCard } from '../components/common/MetricCard';
import { apiClient } from '../api/client';

export const CostRoiPage: React.FC = () => {
  const { telemetry } = useTelemetryContext();
  const [costData, setCostData] = useState<any>(null);
  const [assumptions, setAssumptions] = useState({
    backendRequestCostUsd: 0.00004,
    computeCostPerHourUsd: 0.25,
    memoryCostPerGbHourUsd: 0.018,
    databaseIoCostUsd: 0.000025,
    networkEgressCostPerGbUsd: 0.08,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const fetchCostData = async () => {
    try {
      const data = await apiClient.getCost();
      setCostData(data);
      if (data.assumptions) {
        setAssumptions(data.assumptions);
      }
    } catch (err) {
      console.warn('Error loading cost data:', err);
    }
  };

  useEffect(() => {
    fetchCostData();
    const interval = setInterval(fetchCostData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateAssumptions = async () => {
    setIsSaving(true);
    try {
      await apiClient.updateSettings({ costAssumptions: assumptions });
      setSavedSuccess(true);
      await fetchCostData();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error updating cost assumptions: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-brand-emerald" />
            Transparent Infrastructure Cost & ROI Model
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Deterministic cost model contrasting un-cached baseline against application-aware AdaptiveCache
          </p>
        </div>

        <div className="text-[11px] font-mono text-slate-400 bg-dark-850 px-3 py-1.5 rounded-lg border border-dark-750">
          Formula: <span className="text-brand-cyan font-bold">Net Savings = BaselineCost - AdaptiveCost</span>
        </div>
      </div>

      {/* Mandatory Transparent Disclaimer Banner */}
      <div className="bg-dark-900 border border-dark-750 rounded-xl p-3.5 flex items-center gap-3">
        <Info className="w-4 h-4 text-brand-cyan shrink-0" />
        <span className="text-xs text-slate-300 font-mono">
          {costData?.disclaimer || 'Estimated cost based on measured workload and configured infrastructure assumptions.'}
        </span>
      </div>

      {/* Primary ROI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Baseline Cost / Hour"
          value={`$${costData?.baselineCostPerHour?.toFixed(3) || '0.000'}`}
          subtitle="Without caching (100% DB load)"
          icon={Server}
          iconColor="text-blue-400"
        />

        <MetricCard
          title="AdaptiveCache Cost"
          value={`$${costData?.adaptiveCostPerHour?.toFixed(3) || '0.000'}`}
          subtitle="Memory + Offloaded Compute"
          icon={HardDrive}
          iconColor="text-brand-cyan"
        />

        <MetricCard
          title="Net Hourly Savings"
          value={`$${costData?.netSavingsPerHour?.toFixed(3) || '0.000'}`}
          subtitle={`Savings: ${costData?.savingsPercentage?.toFixed(1) || '0'}%`}
          icon={TrendingUp}
          iconColor="text-brand-emerald"
          badge="NET PROFIT"
          badgeColor="text-brand-emerald bg-brand-emerald/10"
        />

        <MetricCard
          title="Monthly Projected Savings"
          value={`$${costData?.netSavingsMonthly?.toFixed(2) || '0.00'}`}
          subtitle="Annualized ~730 hrs/month"
          icon={DollarSign}
          iconColor="text-brand-emerald"
          badge="ANNUALIZED"
          badgeColor="text-brand-emerald bg-brand-emerald/10"
        />
      </div>

      {/* Breakdown Waterfall & Configurable Unit Costs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Components Breakdown */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-dark-750">
            <span className="font-bold text-slate-200 uppercase tracking-wider">
              Hourly Component Cost Breakdown
            </span>
            <span className="text-[10px] text-brand-emerald bg-brand-emerald/10 px-2 py-0.5 rounded border border-brand-emerald/20">
              {costData?.backendLoadReductionPercent || 0}% DB Offload
            </span>
          </div>

          <div className="space-y-2.5">
            <div className="p-3 bg-dark-850 rounded-lg border border-dark-700 flex justify-between items-center">
              <div>
                <div className="font-bold text-white flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-brand-cyan" />
                  Redis Cache Memory Cost
                </div>
                <div className="text-[10px] text-slate-400">Memory footprint scale (${assumptions.memoryCostPerGbHourUsd}/GB-hr)</div>
              </div>
              <span className="font-bold text-slate-200">${costData?.components?.memoryCostPerHour?.toFixed(4) || '0.0000'}</span>
            </div>

            <div className="p-3 bg-dark-850 rounded-lg border border-dark-700 flex justify-between items-center">
              <div>
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-blue-400" />
                  Backend Compute Capacity
                </div>
                <div className="text-[10px] text-slate-400">Scaled app instances (${assumptions.computeCostPerHourUsd}/instance-hr)</div>
              </div>
              <span className="font-bold text-slate-200">${costData?.components?.backendComputeCostPerHour?.toFixed(4) || '0.0000'}</span>
            </div>

            <div className="p-3 bg-dark-850 rounded-lg border border-dark-700 flex justify-between items-center">
              <div>
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-amber-400" />
                  Database IO & Query Regeneration
                </div>
                <div className="text-[10px] text-slate-400">Measured misses only (${assumptions.databaseIoCostUsd}/query)</div>
              </div>
              <span className="font-bold text-slate-200">${costData?.components?.databaseIoCostPerHour?.toFixed(4) || '0.0000'}</span>
            </div>

            <div className="p-3 bg-dark-850 rounded-lg border border-dark-700 flex justify-between items-center">
              <div>
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-purple-400" />
                  Network Egress Transfer
                </div>
                <div className="text-[10px] text-slate-400">Transferred payload (${assumptions.networkEgressCostPerGbUsd}/GB)</div>
              </div>
              <span className="font-bold text-slate-200">${costData?.components?.egressCostPerHour?.toFixed(4) || '0.0000'}</span>
            </div>
          </div>
        </div>

        {/* Configurable Assumptions Panel */}
        <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-dark-750">
            <span className="font-bold text-slate-200 uppercase tracking-wider">
              Configurable Cloud Pricing Assumptions
            </span>
            {savedSuccess && <span className="text-[10px] text-brand-emerald">✓ Saved</span>}
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-slate-400 block mb-1">Backend DB Query Cost ($/query):</label>
              <input
                type="number"
                step="0.00001"
                value={assumptions.backendRequestCostUsd}
                onChange={(e) => setAssumptions({ ...assumptions, backendRequestCostUsd: parseFloat(e.target.value) || 0 })}
                className="w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-1.5 text-slate-200"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Compute Instance Cost ($/hr):</label>
              <input
                type="number"
                step="0.05"
                value={assumptions.computeCostPerHourUsd}
                onChange={(e) => setAssumptions({ ...assumptions, computeCostPerHourUsd: parseFloat(e.target.value) || 0 })}
                className="w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-1.5 text-slate-200"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Redis Memory Cost ($/GB-hr):</label>
              <input
                type="number"
                step="0.001"
                value={assumptions.memoryCostPerGbHourUsd}
                onChange={(e) => setAssumptions({ ...assumptions, memoryCostPerGbHourUsd: parseFloat(e.target.value) || 0 })}
                className="w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-1.5 text-slate-200"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Database IO Operation Cost ($/query):</label>
              <input
                type="number"
                step="0.000005"
                value={assumptions.databaseIoCostUsd}
                onChange={(e) => setAssumptions({ ...assumptions, databaseIoCostUsd: parseFloat(e.target.value) || 0 })}
                className="w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-1.5 text-slate-200"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Network Egress Cost ($/GB):</label>
              <input
                type="number"
                step="0.01"
                value={assumptions.networkEgressCostPerGbUsd}
                onChange={(e) => setAssumptions({ ...assumptions, networkEgressCostPerGbUsd: parseFloat(e.target.value) || 0 })}
                className="w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-1.5 text-slate-200"
              />
            </div>

            <button
              onClick={handleUpdateAssumptions}
              disabled={isSaving}
              className="w-full mt-2 py-2 bg-brand-cyan hover:bg-cyan-400 text-black font-extrabold rounded-lg transition-colors cursor-pointer"
            >
              {isSaving ? 'SAVING PRICING...' : 'UPDATE PRICING ASSUMPTIONS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
