"""
Simulated Infrastructure Cost Model
Calculates transparent hosting and operational costs based on cache memory, compute, and database loads.
"""

from typing import Dict, Any
from backend.core.types import PricingConfig, SystemConfig


class CostModel:
    def __init__(self, pricing: PricingConfig = SystemConfig.pricing):
        self.pricing = pricing

    def compute_cost(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        cache_capacity_bytes = telemetry.get("cacheCapacityBytes", SystemConfig.cacheCapacityBytes)
        hits_per_second = telemetry.get("hitsPerSecond", 200.0)
        misses_per_second = telemetry.get("missesPerSecond", 50.0)
        backend_load_percent = telemetry.get("backendLoadPercent", 20.0)
        db_queries_per_second = telemetry.get("dbQueriesPerSecond", misses_per_second)

        capacity_gb = cache_capacity_bytes / (1024.0 * 1024.0 * 1024.0)

        # 1. Cache Memory Cost ($/hr)
        cache_cost_per_hour = capacity_gb * self.pricing.cacheMemoryPerHourPerGB

        # 2. Backend Compute Cost ($/hr)
        active_cores = max(1.0, (backend_load_percent / 100.0) * 16.0)
        compute_cost_per_hour = active_cores * self.pricing.backendComputePerHourPerCore

        # 3. Database / API Query Cost ($/hr)
        hourly_db_queries = db_queries_per_second * 3600.0
        db_cost_per_hour = (hourly_db_queries / 10000.0) * self.pricing.databaseQueryCostPer10k

        # 4. Fast in-memory lookup cost ($/hr)
        hourly_hits = hits_per_second * 3600.0
        hit_lookup_cost_per_hour = (hourly_hits / 10000.0) * self.pricing.cacheHitRequestCostPer10k

        # Total Simulated Cost ($/hr)
        total_cost_per_hour = (
            cache_cost_per_hour +
            compute_cost_per_hour +
            db_cost_per_hour +
            hit_lookup_cost_per_hour
        )

        # Baseline "Uncached" DB architecture cost
        total_requests_per_hour = (hits_per_second + misses_per_second) * 3600.0
        uncached_db_cost = (total_requests_per_hour / 10000.0) * self.pricing.databaseQueryCostPer10k
        uncached_compute_cost = 16.0 * self.pricing.backendComputePerHourPerCore * 0.95
        uncached_total_cost = uncached_db_cost + uncached_compute_cost

        # Cost Savings ($/hr) and %
        cost_savings_per_hour = max(0.0, uncached_total_cost - total_cost_per_hour)
        savings_percentage = round((cost_savings_per_hour / uncached_total_cost * 100.0)) if uncached_total_cost > 0 else 0

        return {
            "totalCostPerHour": round(total_cost_per_hour, 3),
            "cacheCostPerHour": round(cache_cost_per_hour, 3),
            "computeCostPerHour": round(compute_cost_per_hour, 3),
            "dbCostPerHour": round(db_cost_per_hour, 3),
            "hitLookupCostPerHour": round(hit_lookup_cost_per_hour, 4),
            "costSavingsPerHour": round(cost_savings_per_hour, 3),
            "savingsPercentage": savings_percentage,
            "uncachedTotalCostPerHour": round(uncached_total_cost, 3),
            "capacityGB": round(capacity_gb, 2),
            "activeCores": round(active_cores, 1),
            "hourlyDbQueries": int(hourly_db_queries),
            "hourlyHits": int(hourly_hits)
        }
