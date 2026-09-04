"""
Multi-Factor Scoring Engine
Evaluates cached objects across 8 normalized dimensions:
1. Frequency (Logarithmic EWMA)
2. Recency (Exponential decay with half-life)
3. Popularity (Share of window traffic)
4. Retrieval/Recompute Cost (DB latency + compute units)
5. Freshness / Staleness (Age vs dynamic TTL & volatility)
6. Trend Velocity (First-derivative hit acceleration)
7. Reuse Probability (Bayesian regularity estimate)
8. Size Penalty (Sublinear footprint cost)
"""

import math
from typing import Dict, Any, Optional
from backend.core.types import WorkloadType, ScoringWeights, SystemConfig


class SmartScorer:
    def __init__(self, workload_type: WorkloadType = WorkloadType.READ_HEAVY_API):
        self.workload_type = workload_type
        self.weights = ScoringWeights()
        self.auto_adapt_weights = True
        self.update_weights_for_workload(workload_type)

    def update_weights_for_workload(self, workload_type: WorkloadType):
        self.workload_type = workload_type
        if self.auto_adapt_weights:
            if workload_type == WorkloadType.COMPUTE_HEAVY_REC:
                self.weights = SystemConfig.computeHeavyWeights.model_copy()
            else:
                self.weights = SystemConfig.readHeavyWeights.model_copy()

    def set_weights(self, custom_weights: Dict[str, float]):
        self.weights = ScoringWeights(**custom_weights)
        self.auto_adapt_weights = False

    def set_auto_adapt(self, enabled: bool):
        self.auto_adapt_weights = bool(enabled)
        if self.auto_adapt_weights:
            self.update_weights_for_workload(self.workload_type)

    def evaluate_object(self, entry: Any, context: Dict[str, Any]) -> Dict[str, Any]:
        current_time = context.get("current_time", 0.0)
        max_item_size_bytes = context.get("max_item_size_bytes", SystemConfig.maxItemSizeBytes)
        total_window_requests = max(10, context.get("total_window_requests", 100))

        # 1. Frequency Score (Normalized EWMA access rate, 0 to 1)
        window_hits = getattr(entry, "recent_hits", 1) or 1
        frequency_score = min(1.0, math.log10(window_hits + 1) / math.log10(50.0))

        # 2. Recency Score (Exponential time decay, 0 to 1)
        time_since_last_access = max(0.0, current_time - getattr(entry, "last_accessed_at", current_time))
        half_life_seconds = 45.0 if self.workload_type == WorkloadType.READ_HEAVY_API else 120.0
        recency_score = math.exp(-0.693 * (time_since_last_access / half_life_seconds))

        # 3. Popularity Score (Share of window traffic, 0 to 1)
        total_hits = getattr(entry, "total_hits", 1)
        popularity_score = min(1.0, (total_hits / float(total_window_requests)) * 3.5)

        # 4. Retrieval / Recomputation Cost Score (0 to 1)
        max_latency_ms = 600.0 if self.workload_type == WorkloadType.COMPUTE_HEAVY_REC else 200.0
        max_compute_units = 40.0 if self.workload_type == WorkloadType.COMPUTE_HEAVY_REC else 5.0
        
        base_db_latency = getattr(entry, "base_db_latency_ms", 50.0)
        recompute_units = getattr(entry, "recompute_cost_units", 1.0)
        
        latency_norm = min(1.0, base_db_latency / max_latency_ms)
        compute_norm = min(1.0, recompute_units / max_compute_units)
        retrieval_cost_score = 0.5 * latency_norm + 0.5 * compute_norm

        # 5. Trend Velocity Score (0 to 1)
        prev_hits = getattr(entry, "prev_window_hits", 0)
        hit_delta = window_hits - prev_hits
        trend_score = 0.5 + min(0.5, max(-0.5, hit_delta / 20.0))

        # 6. Freshness / Staleness Score (0 to 1)
        age = max(0.0, current_time - getattr(entry, "created_at", current_time))
        current_ttl = getattr(entry, "current_ttl", SystemConfig.defaultTTL) or SystemConfig.defaultTTL
        freshness_ratio = max(0.0, 1.0 - (age / float(current_ttl)))
        volatility_impact = getattr(entry, "update_volatility", 0.1)
        freshness_score = max(0.0, freshness_ratio * (1.0 - 0.3 * volatility_impact))

        # 7. Expected Reuse Probability (Bayesian estimate, 0 to 1)
        is_single_use = (total_hits <= 1 and age > 30.0)
        if is_single_use:
            reuse_probability = 0.08
        else:
            reuse_probability = min(1.0, (window_hits / float(window_hits + 2)) * (1.0 + 0.2 * recency_score))

        # 8. Size Penalty (0 to 1)
        size_bytes = getattr(entry, "size_bytes", 4096)
        size_ratio = size_bytes / float(max(1, max_item_size_bytes))
        size_penalty = min(1.0, math.sqrt(size_ratio))

        # Composite Weighted Score
        W = self.weights
        raw_weighted = (
            (W.frequency * frequency_score) +
            (W.recency * recency_score) +
            (W.popularity * popularity_score) +
            (W.retrievalCost * retrieval_cost_score) +
            (W.trend * trend_score) +
            (W.freshness * freshness_score) +
            (W.reuseProbability * reuse_probability) -
            (W.sizePenalty * size_penalty)
        )

        final_score = max(0.01, min(1.0, raw_weighted))

        return {
            "finalScore": round(final_score, 3),
            "factors": {
                "frequency": round(frequency_score, 3),
                "recency": round(recency_score, 3),
                "popularity": round(popularity_score, 3),
                "retrievalCost": round(retrieval_cost_score, 3),
                "trend": round(trend_score, 3),
                "freshness": round(freshness_score, 3),
                "reuseProbability": round(reuse_probability, 3),
                "sizePenalty": round(size_penalty, 3)
            },
            "weights": W.model_dump(),
            "age": round(age, 1),
            "ttl": int(current_ttl),
            "freshnessRatio": round(freshness_ratio, 2),
            "sizeBytes": size_bytes,
            "details": {
                "timeSinceLastAccess": round(time_since_last_access, 1),
                "windowHits": window_hits,
                "totalHits": total_hits
            }
        }
