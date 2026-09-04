"""
Dynamic TTL Recalibration Engine
Continuously adapts object TTL based on popularity, retrieval cost, trend velocity, and mutation volatility.
"""

from typing import Dict, Any
from backend.core.types import SystemConfig


class DynamicTTLManager:
    def __init__(
        self,
        min_ttl: int = SystemConfig.minTTL,
        max_ttl: int = SystemConfig.maxTTL,
        default_ttl: int = SystemConfig.defaultTTL
    ):
        self.min_ttl = min_ttl
        self.max_ttl = max_ttl
        self.default_ttl = default_ttl

    def compute_ttl(self, entry: Any, eval_result: Dict[str, Any]) -> Dict[str, Any]:
        factors = eval_result.get("factors", {})
        popularity = factors.get("popularity", 0.0)
        retrieval_cost = factors.get("retrievalCost", 0.0)
        trend = factors.get("trend", 0.5)
        
        volatility = getattr(entry, "update_volatility", 0.1)
        prev_ttl = getattr(entry, "current_ttl", self.default_ttl) or self.default_ttl

        # Dynamic TTL formula:
        # Base * (1 + 1.5*P + 1.2*C) * (0.5 + Trend) * (1 - 0.75*Volatility)
        base = float(self.default_ttl)
        popularity_boost = 1.0 + (1.5 * popularity) + (1.2 * retrieval_cost)
        trend_multiplier = 0.5 + trend
        volatility_penalty = max(0.2, 1.0 - (0.75 * volatility))

        raw_ttl = base * popularity_boost * trend_multiplier * volatility_penalty
        new_ttl = int(max(self.min_ttl, min(self.max_ttl, raw_ttl)))

        return {
            "prevTTL": prev_ttl,
            "newTTL": new_ttl,
            "delta": new_ttl - prev_ttl,
            "popularityBoost": round(popularity_boost, 2),
            "trendMultiplier": round(trend_multiplier, 2),
            "volatilityPenalty": round(volatility_penalty, 2)
        }
