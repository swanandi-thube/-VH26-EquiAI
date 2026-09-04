/**
 * Live Data Flow & Architecture Pipeline Visualization
 * Displays interactive end-to-end components and live request dispatch state.
 */

import React from 'react';
import {
  Globe,
  Shield,
  Database,
  Layers,
  Zap,
  ArrowRight,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useTelemetryContext } from '../../context/TelemetryContext';

export const ArchitectureFlow: React.FC = () => {
  const { telemetry } = useTelemetryContext();

  const hitRate = telemetry ? (telemetry.cacheHitRate * 100).toFixed(1) : '0.0';
  const backendLoad = telemetry ? (telemetry.backendLoadRatio * 100).toFixed(1) : '0.0';
  const collapsed = telemetry?.collapsedRequestsCount || 0;
  const cbState = telemetry?.circuitBreakerState || 'CLOSED';

  return (
    <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-brand-cyan" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Real-Time Request Pipeline Architecture
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-dark-850 px-2 py-0.5 rounded border border-dark-750">
          Singleflight Coalescing & Multi-Tier Routing
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative items-center">
        {/* Step 1: Client Ingress */}
        <div className="bg-dark-850 border border-dark-700 rounded-lg p-3 relative group hover:border-brand-cyan/50 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-slate-400">01. Ingress</span>
            <Globe className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="font-semibold text-xs text-white">Client Traffic</div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            RPS: <span className="text-white font-bold">{telemetry?.requestsPerSecond || 0}</span>
          </div>
        </div>

        {/* Step 2: Rate Limiter & Coalescer */}
        <div className="bg-dark-850 border border-dark-700 rounded-lg p-3 relative group hover:border-brand-purple/50 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-slate-400">02. Protection</span>
            <Shield className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="font-semibold text-xs text-white">Rate Limit & Coalescer</div>
          <div className="text-[11px] font-mono text-brand-purple mt-1">
            Collapsed: <span className="font-bold">{collapsed}</span>
          </div>
        </div>

        {/* Step 3: Decision Engine & Redis */}
        <div className="bg-dark-850 border border-brand-cyan/30 rounded-lg p-3 relative group hover:border-brand-cyan transition-colors bg-gradient-to-b from-dark-850 to-brand-cyan/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-brand-cyan">03. Adaptive Core</span>
            <Zap className="w-3.5 h-3.5 text-brand-cyan animate-pulse" />
          </div>
          <div className="font-semibold text-xs text-brand-cyan">AdaptiveCache (Redis)</div>
          <div className="text-[11px] font-mono text-brand-emerald mt-1">
            Hit Rate: <span className="font-bold">{hitRate}%</span>
          </div>
        </div>

        {/* Step 4: Circuit Breaker */}
        <div className="bg-dark-850 border border-dark-700 rounded-lg p-3 relative group hover:border-brand-amber/50 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-slate-400">04. Circuit Breaker</span>
            {cbState === 'CLOSED' ? (
              <CheckCircle className="w-3.5 h-3.5 text-brand-emerald" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-brand-amber" />
            )}
          </div>
          <div className="font-semibold text-xs text-white">Fault Gate</div>
          <div className="text-[11px] font-mono mt-1">
            State: <span className={cbState === 'CLOSED' ? 'text-brand-emerald font-bold' : 'text-brand-amber font-bold'}>{cbState}</span>
          </div>
        </div>

        {/* Step 5: PostgreSQL Database */}
        <div className="bg-dark-850 border border-dark-700 rounded-lg p-3 relative group hover:border-blue-400 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-slate-400">05. Database</span>
            <Database className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="font-semibold text-xs text-white">PostgreSQL Store</div>
          <div className="text-[11px] font-mono text-slate-300 mt-1">
            Miss Load: <span className="font-bold text-blue-400">{backendLoad}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
