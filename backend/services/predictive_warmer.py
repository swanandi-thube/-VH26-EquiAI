"""
Predictive Pre-Warming Layer
Uses trend velocity and EMA access forecasting to proactively admit and pre-warm high-value surging items before cache miss penalties occur.
"""

from typing import Dict, Any, List, Optional
from backend.core.types import DecisionType, WorkloadType


class PredictiveWarmer:
    def __init__(self, ema_alpha: float = 0.35):
        self.ema_alpha = ema_alpha
        self.item_access_rates: Dict[str, float] = {}
        self.last_prewarmed: Dict[str, float] = {}

    def track_access(self, item_id: str, count: int = 1):
        prev_rate = self.item_access_rates.get(item_id, 0.0)
        new_rate = (self.ema_alpha * count) + ((1.0 - self.ema_alpha) * prev_rate)
        self.item_access_rates[item_id] = new_rate

    def evaluate_prewarm_candidates(
        self,
        catalog_items: List[Dict[str, Any]],
        resident_keys: set,
        current_time: float,
        traffic_velocity: float
    ) -> List[Dict[str, Any]]:
        candidates = []

        # If overall traffic is increasing or specific items show high velocity
        for item in catalog_items:
            item_id = item["id"]
            rate = self.item_access_rates.get(item_id, 0.0)
            last_warm_time = self.last_prewarmed.get(item_id, 0.0)

            # Check if item is valuable (high retrieval latency or compute cost)
            is_expensive = (item.get("baseDbLatencyMs", 0) > 80 or item.get("recomputeCostUnits", 0) > 4)
            is_surging = (rate > 2.5 or (traffic_velocity > 40 and item.get("basePopularityTier") == "VIP_HOT"))

            # Cooldown of 40s between pre-warms on the same item
            if is_surging and is_expensive and (current_time - last_warm_time > 40.0):
                if item_id not in resident_keys:
                    self.last_prewarmed[item_id] = current_time
                    candidates.append({
                        "item": item,
                        "action": DecisionType.PRE_WARM.value,
                        "reason": (
                            f"Predicted demand acceleration for {item_id} "
                            f"(trend velocity +{rate:.1f} req/w). Pre-warming cache to prevent {item.get('baseDbLatencyMs', 50):.0f}ms miss latency."
                        ),
                        "score": 0.85
                    })

        return candidates
