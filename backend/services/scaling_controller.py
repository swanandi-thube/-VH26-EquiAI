"""
Adaptive Scaling Controller
Evaluates cost-benefit ROI for cache capacity scaling decisions:
- Recommends/Approves SCALE UP when expected backend DB/compute savings exceed added cache memory cost.
- Recommends/Approves SCALE DOWN when memory is underutilized and downsizing safely saves infrastructure cost.
- Rejects unnecessary scaling for transient bursts.
"""

from typing import Dict, Any, Optional
from backend.core.types import PricingConfig, SystemConfig, DecisionType


class ScalingController:
    def __init__(self, pricing: PricingConfig = SystemConfig.pricing):
        self.pricing = pricing
        self.last_scale_time = 0.0

    def evaluate_scaling(
        self,
        current_capacity_bytes: int,
        telemetry: Dict[str, Any],
        scenario: str = "STEADY",
        current_time: float = 0.0
    ) -> Dict[str, Any]:
        current_gb = current_capacity_bytes / (1024.0 * 1024.0 * 1024.0)
        memory_usage_percent = telemetry.get("memoryUsagePercent", 50.0)
        hits_per_sec = telemetry.get("hitsPerSecond", 200.0)
        misses_per_sec = telemetry.get("missesPerSecond", 50.0)
        rps = hits_per_sec + misses_per_sec
        hit_rate = telemetry.get("hitRate", 0.8)
        miss_rate = 1.0 - hit_rate
        backend_load_percent = telemetry.get("backendLoadPercent", 20.0)

        # Proposed scale up tier (double) or scale down tier (half)
        proposed_up_gb = min(16.0, current_gb * 2.0)
        proposed_down_gb = max(0.5, current_gb / 2.0)

        # 1. Evaluate Scale-Up ROI
        delta_up_gb = proposed_up_gb - current_gb
        added_cache_cost_per_hr = delta_up_gb * self.pricing.cacheMemoryPerHourPerGB

        # Expected hit rate gain from additional capacity (Zipfian diminishing returns)
        expected_hit_gain = min(
            miss_rate * 0.70,
            max(0.01, miss_rate * (delta_up_gb / (current_gb + delta_up_gb * 1.2)) * 0.50)
        )
        avoided_hourly_misses = (rps * 3600.0) * expected_hit_gain
        db_saved_per_hr = (avoided_hourly_misses / 10000.0) * self.pricing.databaseQueryCostPer10k
        compute_saved_per_hr = (
            (avoided_hourly_misses / max(1.0, rps * 3600.0)) *
            (backend_load_percent / 100.0) * 16.0 *
            self.pricing.backendComputePerHourPerCore * 0.35
        )
        expected_backend_saving_per_hr = db_saved_per_hr + compute_saved_per_hr
        net_benefit_per_hr = expected_backend_saving_per_hr - added_cache_cost_per_hr

        # Scale down savings
        delta_down_gb = current_gb - proposed_down_gb
        down_memory_saving_per_hr = delta_down_gb * self.pricing.cacheMemoryPerHourPerGB

        # Scaling decision logic
        should_scale_up = (
            net_benefit_per_hr > 0.01 and
            memory_usage_percent > 70.0 and
            scenario != "TRAFFIC_BURST" and
            current_gb < 8.0
        )
        
        should_scale_down = (
            memory_usage_percent < 35.0 and
            current_gb > 1.0 and
            scenario in ["STEADY", "NORMAL_TRAFFIC"] and
            rps < 300
        )

        decision = "MAINTAIN"
        badge = "STABLE CAPACITY"
        color = "#10b981"
        proposed_gb = current_gb
        reason = f"Optimal capacity ({current_gb:.1f} GB) at {memory_usage_percent:.0f}% utilization."

        if scenario == "TRAFFIC_BURST":
            reason = "Traffic burst detected, but duration is short. Scale-up rejected to avoid unnecessary infrastructure cost."
            badge = "SCALE-UP REJECTED (BURST)"
            color = "#f97316"
        elif should_scale_up:
            decision = DecisionType.SCALE_UP.value
            badge = "SCALE UP APPROVED"
            color = "#8b5cf6"
            proposed_gb = proposed_up_gb
            reason = (
                f"Scale-up approved: Expected DB/compute savings (+${expected_backend_saving_per_hr:.3f}/hr) "
                f"exceed additional cache memory cost (+${added_cache_cost_per_hr:.3f}/hr). Net benefit: +${net_benefit_per_hr:.3f}/hr."
            )
        elif should_scale_down:
            decision = DecisionType.SCALE_DOWN.value
            badge = "SCALE DOWN APPROVED"
            color = "#38bdf8"
            proposed_gb = proposed_down_gb
            reason = (
                f"Scale-down completed: Cache utilization is only {memory_usage_percent:.0f}%. "
                f"Safely reducing {current_gb:.1f}GB -> {proposed_down_gb:.1f}GB saves ${down_memory_saving_per_hr:.3f}/hr."
            )
        elif memory_usage_percent <= 70.0:
            reason = f"Cache utilization is {memory_usage_percent:.0f}%. Sufficient headroom exists; additional capacity cost not justified."

        return {
            "currentGB": round(current_gb, 1),
            "proposedGB": round(proposed_gb, 1),
            "decision": decision,
            "badge": badge,
            "color": color,
            "shouldScaleUp": should_scale_up,
            "shouldScaleDown": should_scale_down,
            "additionalCacheCostPerHour": round(added_cache_cost_per_hr, 3),
            "expectedBackendSavingPerHour": round(expected_backend_saving_per_hr, 3),
            "netBenefitPerHour": round(net_benefit_per_hr, 3),
            "downMemorySavingPerHour": round(down_memory_saving_per_hr, 3),
            "expectedHitRateGainPercent": round(expected_hit_gain * 100.0, 1),
            "decisionReason": reason
        }
