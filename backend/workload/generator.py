"""
Workload & Traffic Generator
Generates realistic Zipfian/Pareto distributed request streams with dynamic scenario states.
"""

import math
import random
import time
from typing import Dict, Any, List, Optional
from backend.core.types import WorkloadType, TrafficScenario, SystemConfig
from backend.workload.catalog import ItemCatalog


class WorkloadGenerator:
    def __init__(self, catalog: Optional[ItemCatalog] = None):
        self.catalog = catalog or ItemCatalog()
        self.workload_type = WorkloadType.READ_HEAVY_API
        self.scenario = TrafficScenario.STEADY
        self.base_rps = SystemConfig.baseRps
        self.speed_multiplier = 1.0

        self.sim_time_seconds = 0.0
        self.spike_target_item_id = "prod_048"
        self.shift_phase = 0
        self.pollution_rate = 0.0

        self.zipf_weights: Dict[str, float] = {}
        self.recompute_weights()

    def set_workload_type(self, w_type: WorkloadType):
        if self.workload_type != w_type:
            self.workload_type = w_type
            self.spike_target_item_id = "rec_model_012" if w_type == WorkloadType.COMPUTE_HEAVY_REC else "prod_048"
            self.recompute_weights()

    def set_scenario(self, scenario: TrafficScenario, options: Optional[Dict[str, Any]] = None):
        opts = options or {}
        self.scenario = scenario
        if "targetItemId" in opts:
            self.spike_target_item_id = opts["targetItemId"]
        
        if scenario == TrafficScenario.CACHE_POLLUTION:
            self.pollution_rate = opts.get("pollutionRate", 0.85)
        else:
            self.pollution_rate = 0.0

        self.recompute_weights()

    def set_base_rps(self, rps: int):
        self.base_rps = max(10, min(5000, int(rps)))

    def set_speed_multiplier(self, multiplier: float):
        self.speed_multiplier = max(0.1, float(multiplier))

    def recompute_weights(self):
        items = self.catalog.get_catalog(self.workload_type)
        n = len(items)
        s = 1.25 if self.workload_type == WorkloadType.READ_HEAVY_API else 0.85

        self.zipf_weights.clear()
        total_weight = 0.0

        for rank in range(1, n + 1):
            item = items[rank - 1]
            weight = 1.0 / math.pow(rank, s)

            if self.scenario == TrafficScenario.POPULARITY_SPIKE and item["id"] == self.spike_target_item_id:
                weight *= 45.0  # 45x surge on spike target
            elif self.scenario == TrafficScenario.GRADUAL_SHIFT:
                shifted_rank = ((rank - 1 + self.shift_phase) % n) + 1
                weight = 1.0 / math.pow(shifted_rank, s)

            self.zipf_weights[item["id"]] = weight
            total_weight += weight

        # Normalize probabilities
        for item_id in self.zipf_weights:
            self.zipf_weights[item_id] /= max(1e-9, total_weight)

    def tick(self, delta_ms: int) -> Dict[str, Any]:
        self.sim_time_seconds += (delta_ms / 1000.0) * self.speed_multiplier

        if self.scenario == TrafficScenario.GRADUAL_SHIFT:
            items = self.catalog.get_catalog(self.workload_type)
            self.shift_phase = int(self.sim_time_seconds / 15.0) % len(items)
            self.recompute_weights()

        effective_rps = float(self.base_rps)
        if self.scenario == TrafficScenario.TRAFFIC_BURST:
            effective_rps *= 3.8
        elif self.scenario == TrafficScenario.COLD_START:
            effective_rps *= 1.2

        request_count = max(1, int(round((effective_rps * (delta_ms / 1000.0)) * self.speed_multiplier)))
        requests = []

        for _ in range(request_count):
            if self.scenario == TrafficScenario.CACHE_POLLUTION and random.random() < self.pollution_rate:
                unique_key_id = f"crawler_scan_{int(time.time()*1000)}_{random.randint(1000, 999999)}"
                requests.append({
                    "id": unique_key_id,
                    "name": f"Uncached Ephemeral Key ({unique_key_id[-6:]})",
                    "category": "EPHEMERAL_BOT",
                    "type": "UncachedProbe",
                    "sizeBytes": 8 * 1024 + random.randint(0, 64 * 1024),
                    "baseDbLatencyMs": 35.0 + random.randint(0, 50),
                    "recomputeCostUnits": 1.0,
                    "updateVolatility": 1.0,
                    "isPollutionKey": True,
                    "timestamp": self.sim_time_seconds
                })
                continue

            item = self._sample_item()
            if item:
                req_copy = dict(item)
                req_copy["timestamp"] = self.sim_time_seconds
                requests.append(req_copy)

        return {
            "simTimeSeconds": self.sim_time_seconds,
            "workloadType": self.workload_type.value,
            "scenario": self.scenario.value,
            "effectiveRps": round(effective_rps, 1),
            "requestCount": len(requests),
            "requests": requests
        }

    def _sample_item(self) -> Optional[Dict[str, Any]]:
        r = random.random()
        cumulative = 0.0
        items = self.catalog.get_catalog(self.workload_type)

        for item in items:
            prob = self.zipf_weights.get(item["id"], 0.0)
            cumulative += prob
            if r <= cumulative:
                return item

        return items[-1] if items else None
