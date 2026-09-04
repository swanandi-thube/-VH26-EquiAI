/**
 * Decision Explainability Modal / Drawer (Warm Tech Theme)
 * Displays deep mathematical attribution and natural language reasoning for any cache decision.
 */

import React from 'react';
import {
  X,
  Zap,
  TrendingUp,
  Clock,
  Database,
  Server,
  HardDrive,
  Info,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useTelemetryContext } from '../../context/TelemetryContext';

export const ExplainabilityDrawer: React.FC = () => {
  const {
    isExplainDrawerOpen,
    closeExplainDrawer,
    selectedExplanation,
    selectedDecisionId
  } = useTelemetryContext();

  if (!isExplainDrawerOpen) return null;

  const exp = selectedExplanation;

  const getDecisionBadge = (type?: string) => {
    switch (type) {
      case 'PRE-CACHE':
        return <span className="bg-orange-500/20 text-orange-300 border border-orange-500/40 px-2.5 py-1 rounded font-mono font-bold text-xs">PRE-CACHE</span>;
      case 'REFRESH':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded font-mono font-bold text-xs">REFRESH</span>;
      case 'EVICT':
        return <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-1 rounded font-mono font-bold text-xs">EVICT</span>;
      case 'KEEP':
      default:
        return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded font-mono font-bold text-xs">KEEP</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
        {/* Header */}
        <div className="p-5 border-b border-dark-750 flex items-center justify-between sticky top-0 bg-dark-900/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-stone-100">Decision Explainability Inspector</h3>
                {exp && getDecisionBadge(exp.decisionType)}
              </div>
              <p className="text-xs font-mono text-stone-400">
                Target: <span className="text-stone-200 font-semibold">{exp?.objectId || 'Loading...'}</span> | Decision ID: <span className="text-stone-300">{selectedDecisionId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={closeExplainDrawer}
            className="p-2 text-stone-400 hover:text-stone-100 hover:bg-dark-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {exp ? (
          <div className="p-6 space-y-6">
            {/* Top Cards: Score & Predicted Demand */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-dark-850 border border-dark-750 rounded-xl p-3.5">
                <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">Adaptive Score</span>
                <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                  {exp.adaptiveScore.toFixed(2)}
                </div>
                <div className="text-[10px] text-stone-400 mt-1">Scale: 0.00 (Evict) to 1.00 (Retain)</div>
              </div>

              <div className="bg-dark-850 border border-dark-750 rounded-xl p-3.5">
                <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">Predicted Demand</span>
                <div className="text-2xl font-bold font-mono text-brand-emerald mt-1">
                  {exp.predictedDemandPercent > 0 ? `+${exp.predictedDemandPercent}%` : `${exp.predictedDemandPercent}%`}
                </div>
                <div className="text-[10px] text-stone-400 mt-1">Confidence: {(exp.confidence * 100).toFixed(0)}%</div>
              </div>

              <div className="bg-dark-850 border border-dark-750 rounded-xl p-3.5">
                <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">TTL Calibration</span>
                <div className="text-2xl font-bold font-mono text-stone-100 mt-1">
                  {exp.recommendedTtlSeconds}s
                </div>
                <div className="text-[10px] text-stone-400 mt-1">
                  Previous: {exp.previousTtlSeconds}s ({exp.ttlChangeSeconds >= 0 ? `+${exp.ttlChangeSeconds}s` : `${exp.ttlChangeSeconds}s`})
                </div>
              </div>
            </div>

            {/* Why section: Natural Language Reasoning */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-stone-300">
                <Info className="w-4 h-4 text-amber-400" />
                Backend Reasoning
              </div>
              <p className="text-sm text-stone-200 leading-relaxed font-sans bg-dark-900 p-3 rounded-lg border border-dark-750">
                "{exp.reason}"
              </p>
              <p className="text-xs text-stone-400 mt-2 italic">
                {exp.summaryMessage}
              </p>
            </div>

            {/* Mathematical Factor Attribution Breakdown */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-300">
                  Multi-Factor Weight Attribution Formula
                </span>
                <span className="text-[10px] font-mono text-stone-400">
                  Score = Σ(Weight × Factor) - MemoryPenalty
                </span>
              </div>

              <div className="border border-dark-750 rounded-xl overflow-hidden divide-y divide-dark-800">
                {exp.attributions.map((attr) => {
                  const isPositive = attr.contribution >= 0;
                  return (
                    <div key={attr.key} className="p-3 bg-dark-850 hover:bg-dark-800 transition-colors flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-stone-200 flex items-center gap-2">
                          <span>{attr.name}</span>
                          <span className="text-[10px] font-mono text-stone-400">(weight: {attr.weight.toFixed(2)})</span>
                        </div>
                        <p className="text-[11px] text-stone-400">{attr.description}</p>
                      </div>

                      <div className="text-right pl-4 shrink-0 font-mono">
                        <div className={`text-sm font-bold ${isPositive ? 'text-brand-emerald' : 'text-brand-rose'}`}>
                          {isPositive ? `+${attr.contribution.toFixed(2)}` : attr.contribution.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-stone-400">Raw: {attr.rawValue.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-[11px] text-stone-400 font-mono text-right pt-2 border-t border-dark-800">
              Generated at: {new Date(exp.timestamp).toISOString()}
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-stone-400 font-mono text-sm">
            Loading explainability metrics from backend...
          </div>
        )}
      </div>
    </div>
  );
};
