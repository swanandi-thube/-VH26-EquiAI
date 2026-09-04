/**
 * Decision Explainability Engine
 * Converts mathematical factor states and decision trees into transparent,
 * human-readable breakdowns with full mathematical weight attribution.
 */

import { DecisionRecord, SystemSettings } from '../types';

export interface FactorAttribution {
  name: string;
  key: string;
  rawValue: number;
  weight: number;
  contribution: number; // positive or negative signed value
  description: string;
}

export interface DecisionExplanation {
  id: string;
  objectId: string;
  decisionType: string;
  adaptiveScore: number;
  confidence: number;
  predictedDemandPercent: number;
  previousTtlSeconds: number;
  recommendedTtlSeconds: number;
  ttlChangeSeconds: number;
  reason: string;
  timestamp: number;
  attributions: FactorAttribution[];
  summaryMessage: string;
}

export class ExplainabilityEngine {
  public explain(record: DecisionRecord, settings: SystemSettings): DecisionExplanation {
    const f = record.factors;
    const w = settings.weights;

    const attributions: FactorAttribution[] = [
      {
        name: 'Demand Trend',
        key: 'trend',
        rawValue: f.trend,
        weight: w.trend,
        contribution: Math.round(f.trend * w.trend * 100) / 100,
        description: `Velocity of request rate change (+${Math.round(f.predictedDemand * 100)}% projected)`,
      },
      {
        name: 'Access Frequency',
        key: 'frequency',
        rawValue: f.frequency,
        weight: w.frequency,
        contribution: Math.round(f.frequency * w.frequency * 100) / 100,
        description: 'Exponentially decayed access recurrence history (EWMA)',
      },
      {
        name: 'Recency Decay',
        key: 'recency',
        rawValue: f.recency,
        weight: w.recency,
        contribution: Math.round(f.recency * w.recency * 100) / 100,
        description: 'Time elapsed since last request with exponential decay',
      },
      {
        name: 'Retrieval Cost',
        key: 'retrievalCost',
        rawValue: f.retrievalCost,
        weight: w.retrievalCost,
        contribution: Math.round(f.retrievalCost * w.retrievalCost * 100) / 100,
        description: 'Normalized database lookup latency & CPU recomputation complexity',
      },
      {
        name: 'Backend Pressure',
        key: 'backendPressure',
        rawValue: f.backendPressure,
        weight: w.backendPressure,
        contribution: Math.round(f.backendPressure * w.backendPressure * 100) / 100,
        description: 'Current connection pool saturation, queue depth, and error rate',
      },
      {
        name: 'Memory Footprint Penalty',
        key: 'memoryCost',
        rawValue: f.memoryCost,
        weight: w.memoryCostPenalty,
        contribution: -Math.round(f.memoryCost * w.memoryCostPenalty * 100) / 100,
        description: 'Memory capacity consumption penalty against total cache budget',
      },
    ];

    let summary = '';
    if (record.decisionType === 'PRE-CACHE') {
      summary = `AdaptiveCache pre-cached this item because predicted demand surged by +${Math.round(f.predictedDemand * 100)}% with high backend recomputation cost (${Math.round(f.retrievalCost * 450)}ms).`;
    } else if (record.decisionType === 'REFRESH') {
      summary = `Asynchronous background refresh scheduled before expiration to prevent an expensive backend cache miss stampede.`;
    } else if (record.decisionType === 'EVICT') {
      summary = `Object demoted from memory to reclaim space due to low demand score (${record.adaptiveScore.toFixed(2)}) and memory footprint.`;
    } else {
      summary = `Object retained in cache with an adaptive TTL recalibrated to ${record.newTtl} seconds based on steady access utility.`;
    }

    return {
      id: record.id,
      objectId: record.objectId,
      decisionType: record.decisionType,
      adaptiveScore: record.adaptiveScore,
      confidence: record.confidence,
      predictedDemandPercent: Math.round(record.predictedDemand * 100),
      previousTtlSeconds: record.previousTtl,
      recommendedTtlSeconds: record.newTtl,
      ttlChangeSeconds: record.newTtl - record.previousTtl,
      reason: record.reason,
      timestamp: record.timestamp,
      attributions,
      summaryMessage: summary,
    };
  }
}

export const explainability = new ExplainabilityEngine();
