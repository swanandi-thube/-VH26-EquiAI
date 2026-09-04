"""
Central Simulation Engine (Python Core)
Master coordinator uniting Workload Generator, Smart Cache, Baseline Caches, DB, Latencies, Traffic Monitor, Predictive Pre-Warmer, Cost Model, Scaling Controller, and Decision Logger.
"""

from collections import deque
import time
from typing import Dict, Any, List, Optional
from backend.core.types import (
    WorkloadType, TrafficScenario, CacheStrategy, DecisionType,
    SystemConfig, ScoringWeights
)
from backend.workload.catalog import ItemCatalog
from backend.workload.generator import WorkloadGenerator
from backend.cache.smart_cache import SmartCache
from backend.cache.lru_cache import LRUCache
from backend.cache.lfu_cache import LFUCache
from backend.cache.gds_cache import GDSCache
from backend.services.database_sim import DatabaseSimulator, BackendService
from backend.services.traffic_monitor import TrafficMonitor
from backend.services.predictive_warmer import PredictiveWarmer
from backend.services.cost_model import CostModel
from backend.services.scaling_controller import ScalingController
from backend.services.decision_logger import DecisionLogger


class SimulationEngine:
    def __init__(self):
        self.catalog = ItemCatalog()
        self.workload_generator = WorkloadGenerator(self.catalog)
        self.cache_capacity_bytes = SystemConfig.cacheCapacityBytes

        # Cache instances
        self.smart_cache = SmartCache(self.cache_capacity_bytes, WorkloadType.READ_HEAVY_API)
        self.lru_cache = LRUCache(self.cache_capacity_bytes)
        self.lfu_cache = LFUCache(self.cache_capacity_bytes)
        self.gds_cache = GDSCache(self.cache_capacity_bytes)

        # Services
        self.db_simulator = DatabaseSimulator()
        self.backend_service = BackendService()
        self.traffic_monitor = TrafficMonitor()
        self.predictive_warmer = PredictiveWarmer()
        self.cost_model = CostModel()
        self.scaling_controller = ScalingController()
        self.decision_logger = DecisionLogger()

        # Telemetry & history
        self.is_running = True
        self.current_sim_time = 0.0
        self.latency_reservoir: deque = deque(maxlen=250)
        self.rolling_history: deque = deque(maxlen=40)
        self.last_scaling_action_time = 0.0

        # Seed initial warm cache entries
        self.seed_warm_cache()

    def seed_warm_cache(self):
        items = self.catalog.get_catalog(self.workload_generator.workload_type)
        for i in range(min(35, len(items))):
            item = items[i]
            self.smart_cache.put(item, 0.0)
            self.lru_cache.put(item, 0.0)
            self.lfu_cache.put(item, 0.0)
            self.gds_cache.put(item, 0.0)

    def set_workload_type(self, w_type: WorkloadType):
        self.workload_generator.set_workload_type(w_type)
        self.smart_cache.set_workload_type(w_type)
        self.decision_logger.log_decision(
            event_type="WORKLOAD_SWITCH",
            title=f"Switched Workload to {'Read-Heavy API' if w_type == WorkloadType.READ_HEAVY_API else 'Compute-Heavy Recommendation'}",
            description="Adapted multi-factor weights, recompute costs, and dynamic latency models.",
            severity="info",
            timestamp=self.current_sim_time
        )

    def set_scenario(self, scenario: TrafficScenario, options: Optional[Dict[str, Any]] = None):
        self.workload_generator.set_scenario(scenario, options)
        
        desc = f"Traffic pattern switched to {scenario.value}"
        if scenario == TrafficScenario.POPULARITY_SPIKE:
            desc = f"Popularity surge triggered on {self.workload_generator.spike_target_item_id} (+4500% request share)."
        elif scenario == TrafficScenario.COLD_START:
            self.smart_cache.clear()
            self.lru_cache.clear()
            self.lfu_cache.clear()
            self.gds_cache.clear()
            desc = "Cache wiped. Cold start initiated under full incoming traffic."
        elif scenario == TrafficScenario.CACHE_POLLUTION:
            desc = "Unique key deluge injected. Testing Cache Pollution Defense."
        elif scenario == TrafficScenario.TRAFFIC_BURST:
            desc = "Transient traffic volume surge: 3.8x baseline request burst."

        self.decision_logger.log_decision(
            event_type="SCENARIO_CHANGE",
            title=f"Scenario: {scenario.value.replace('_', ' ')}",
            description=desc,
            severity="warning" if scenario == TrafficScenario.CACHE_POLLUTION else "success",
            timestamp=self.current_sim_time
        )

    def set_base_rps(self, rps: int):
        self.workload_generator.set_base_rps(rps)

    def set_speed_multiplier(self, speed: float):
        self.workload_generator.set_speed_multiplier(speed)

    def set_capacity(self, new_capacity_bytes: int):
        self.cache_capacity_bytes = new_capacity_bytes
        self.smart_cache.set_capacity(new_capacity_bytes)
        self.lru_cache.set_capacity(new_capacity_bytes)
        self.lfu_cache.set_capacity(new_capacity_bytes)
        self.gds_cache.set_capacity(new_capacity_bytes)

        gb = new_capacity_bytes / (1024.0 * 1024.0 * 1024.0)
        self.decision_logger.log_decision(
            event_type="CAPACITY_CHANGE",
            title=f"Cache Capacity Resized to {gb:.1f} GB",
            description="Eviction thresholds and memory allocation recalculated.",
            severity="primary",
            timestamp=self.current_sim_time
        )

    def set_scoring_weights(self, weights_dict: Dict[str, float]):
        self.smart_cache.scorer.set_weights(weights_dict)
        self.decision_logger.log_decision(
            event_type="SCORING_WEIGHTS_UPDATED",
            title="Custom Scoring Weights Applied",
            description="Scoring formula recalculated for all resident objects.",
            severity="info",
            timestamp=self.current_sim_time
        )

    def set_auto_adapt_weights(self, enabled: bool):
        self.smart_cache.scorer.set_auto_adapt(enabled)

    def ingest_custom_data(self, items: List[Dict[str, Any]]):
        self.catalog.read_heavy_catalog = items
        self.catalog.compute_heavy_catalog = items
        self.workload_generator.recompute_weights()
        self.smart_cache.clear()
        self.lru_cache.clear()
        self.lfu_cache.clear()
        self.gds_cache.clear()
        self.seed_warm_cache()
        self.decision_logger.log_decision(
            event_type="USER_DATA_INGESTED",
            title="Custom User Data Ingested",
            description=f"Loaded {len(items)} custom items into active catalog & simulation pipeline.",
            severity="success",
            timestamp=self.current_sim_time
        )

    def reset(self):
        self.current_sim_time = 0.0
        self.smart_cache.clear()
        self.lru_cache.clear()
        self.lfu_cache.clear()
        self.gds_cache.clear()
        self.db_simulator.reset()
        self.backend_service.reset()
        self.decision_logger.clear()
        self.latency_reservoir.clear()
        self.rolling_history.clear()
        self.cache_capacity_bytes = SystemConfig.cacheCapacityBytes
        self.smart_cache.set_capacity(self.cache_capacity_bytes)
        self.seed_warm_cache()
        self.decision_logger.log_decision(
            event_type="SIMULATION_RESET",
            title="Simulation Environment Reset",
            description="All cache stores, latency reservoirs, and metrics cleared.",
            severity="info",
            timestamp=0.0
        )

    def tick(self, delta_ms: int = 250) -> Dict[str, Any]:
        # 1. Generate Request Batch
        batch = self.workload_generator.tick(delta_ms)
        self.current_sim_time = batch["simTimeSeconds"]
        requests = batch["requests"]
        effective_rps = batch["effectiveRps"]
        workload_type = batch["workloadType"]
        scenario = batch["scenario"]

        # 2. Process requests through Smart Cache and shadow stores
        batch_results = []
        tick_hits = 0
        tick_misses = 0

        for req in requests:
            req_id = req["id"]
            # Track rate for predictive pre-warming
            self.predictive_warmer.track_access(req_id)

            get_res = self.smart_cache.get(req_id, self.current_sim_time)
            if not get_res["hit"]:
                put_res = self.smart_cache.put(req, self.current_sim_time)
                tick_misses += 1
                if put_res.get("admitted") and put_res.get("entry"):
                    e = put_res["entry"]
                    if len(self.decision_logger.events) < 5 or tick_misses % 8 == 0:
                        self.decision_logger.log_cache_action(
                            action=e.decision,
                            item_id=req_id,
                            score=e.score,
                            reason=e.reason,
                            factors=e.factors,
                            timestamp=self.current_sim_time
                        )
            else:
                tick_hits += 1
                e = get_res["entry"]
                if e and e.decision == DecisionType.REFRESH.value:
                    self.decision_logger.log_cache_action(
                        action=DecisionType.REFRESH.value,
                        item_id=req_id,
                        score=e.score,
                        reason=e.reason,
                        factors=e.factors,
                        timestamp=self.current_sim_time
                    )

            batch_results.append({"hit": get_res["hit"], "item": req})

            # Shadow caches
            lru_res = self.lru_cache.get(req_id, self.current_sim_time)
            if not lru_res["hit"]:
                self.lru_cache.put(req, self.current_sim_time)

            lfu_res = self.lfu_cache.get(req_id, self.current_sim_time)
            if not lfu_res["hit"]:
                self.lfu_cache.put(req, self.current_sim_time)

            gds_res = self.gds_cache.get(req_id, self.current_sim_time)
            if not gds_res["hit"]:
                self.gds_cache.put(req, self.current_sim_time)

        # 3. Database Simulation
        db_telemetry = self.db_simulator.process_misses(tick_misses, delta_ms, workload_type)

        # 4. Backend Service Latency Generation
        backend_result = self.backend_service.process_request_batch(batch_results, db_telemetry, workload_type)
        for lat in backend_result["latencies"]:
            self.latency_reservoir.append(lat)

        # 5. Periodic Smart Cache Maintenance
        self.smart_cache.periodic_maintenance(self.current_sim_time, len(requests))

        # 6. Predictive Pre-Warming Evaluation
        traffic_status = self.traffic_monitor.record_tick(effective_rps, scenario)
        catalog_items = self.catalog.get_catalog(self.workload_generator.workload_type)
        resident_keys = set(self.smart_cache.entries.keys())
        
        prewarm_candidates = self.predictive_warmer.evaluate_prewarm_candidates(
            catalog_items,
            resident_keys,
            self.current_sim_time,
            traffic_status["trendVelocity"]
        )
        for cand in prewarm_candidates:
            self.smart_cache.put(cand["item"], self.current_sim_time)
            self.decision_logger.log_cache_action(
                action=DecisionType.PRE_WARM.value,
                item_id=cand["item"]["id"],
                score=cand["score"],
                reason=cand["reason"],
                factors={"trend": 0.95, "retrievalCost": 0.90},
                timestamp=self.current_sim_time
            )

        # 7. Compute Telemetry, Percentiles & Costs
        sorted_lats = sorted(list(self.latency_reservoir))
        n_lats = len(sorted_lats)
        p50 = sorted_lats[int(n_lats * 0.50)] if n_lats > 0 else 4.0
        p95 = sorted_lats[int(n_lats * 0.95)] if n_lats > 0 else 18.0
        p99 = sorted_lats[int(n_lats * 0.99)] if n_lats > 0 else 45.0
        avg_lat = (sum(sorted_lats) / float(n_lats)) if n_lats > 0 else 6.0

        hit_rate = self.smart_cache.get_hit_rate()
        miss_rate = 1.0 - hit_rate

        cost_telemetry = {
            "cacheCapacityBytes": self.cache_capacity_bytes,
            "usedBytes": self.smart_cache.used_bytes,
            "hitsPerSecond": effective_rps * hit_rate,
            "missesPerSecond": effective_rps * miss_rate,
            "backendLoadPercent": backend_result["backendLoadPercent"],
            "dbQueriesPerSecond": effective_rps * miss_rate
        }
        cost_result = self.cost_model.compute_cost(cost_telemetry)

        # 8. Adaptive Scaling Evaluation
        scaling_telemetry = {
            "hitsPerSecond": cost_telemetry["hitsPerSecond"],
            "missesPerSecond": cost_telemetry["missesPerSecond"],
            "hitRate": hit_rate,
            "backendLoadPercent": backend_result["backendLoadPercent"],
            "memoryUsagePercent": self.smart_cache.get_usage_percent()
        }
        scaling_result = self.scaling_controller.evaluate_scaling(
            self.cache_capacity_bytes,
            scaling_telemetry,
            scenario=scenario,
            current_time=self.current_sim_time
        )

        # Handle automated capacity scaling if approved and cooldown passed
        if (self.current_sim_time - self.last_scaling_action_time > 20.0):
            if scaling_result["shouldScaleUp"]:
                new_bytes = int(scaling_result["proposedGB"] * 1024 * 1024 * 1024)
                self.set_capacity(new_bytes)
                self.last_scaling_action_time = self.current_sim_time
                self.decision_logger.log_decision(
                    event_type=DecisionType.SCALE_UP.value,
                    title=f"Scale-Up Executed: {scaling_result['currentGB']} GB ➔ {scaling_result['proposedGB']} GB",
                    description=scaling_result["decisionReason"],
                    severity="primary",
                    timestamp=self.current_sim_time
                )
            elif scaling_result["shouldScaleDown"]:
                new_bytes = int(scaling_result["proposedGB"] * 1024 * 1024 * 1024)
                self.set_capacity(new_bytes)
                self.last_scaling_action_time = self.current_sim_time
                self.decision_logger.log_decision(
                    event_type=DecisionType.SCALE_DOWN.value,
                    title=f"Scale-Down Executed: {scaling_result['currentGB']} GB ➔ {scaling_result['proposedGB']} GB",
                    description=scaling_result["decisionReason"],
                    severity="info",
                    timestamp=self.current_sim_time
                )

        pollution_status = self.smart_cache.pollution_guard.get_status()

        snapshot = {
            "simTime": round(self.current_sim_time),
            "trafficRps": round(effective_rps, 1),
            "hitRatePercent": round(hit_rate * 100.0, 1),
            "missRatePercent": round(miss_rate * 100.0, 1),
            "p50LatencyMs": round(p50, 1),
            "p95LatencyMs": round(p95, 1),
            "p99LatencyMs": round(p99, 1),
            "avgLatencyMs": round(avg_lat, 1),
            "costPerHour": cost_result["totalCostPerHour"],
            "costSavingsPerHour": cost_result["costSavingsPerHour"],
            "savingsPercentage": cost_result["savingsPercentage"],
            "uncachedCostPerHour": cost_result["uncachedTotalCostPerHour"],
            "cacheCostPerHour": cost_result["cacheCostPerHour"],
            "computeCostPerHour": cost_result["computeCostPerHour"],
            "dbCostPerHour": cost_result["dbCostPerHour"],
            "backendLoadPercent": backend_result["backendLoadPercent"],
            "activeThreads": backend_result["activeThreads"],
            "dbCpuPercent": db_telemetry["cpuUtilizationPercent"],
            "dbLatencyMs": db_telemetry["currentLatencyMs"],
            "dbConnections": db_telemetry["activeConnections"],
            "dbQueriesPerSecond": db_telemetry["queriesPerSecond"],
            "memoryUsedMB": round(self.smart_cache.used_bytes / (1024.0 * 1024.0), 1),
            "memoryCapacityMB": round(self.cache_capacity_bytes / (1024.0 * 1024.0), 1),
            "memoryUsagePercent": round(self.smart_cache.get_usage_percent(), 1),
            "evictions": self.smart_cache.evictions,
            "refreshes": self.smart_cache.refreshes,
            "activeItemsCount": len(self.smart_cache.entries),
            "workloadType": workload_type,
            "scenario": scenario,
            "trafficState": traffic_status,
            "pollutionRisk": pollution_status["riskLevel"],
            "uniqueKeyRatePercent": pollution_status["uniqueKeyRatePercent"],
            "usefulOccupancyPercent": pollution_status["usefulOccupancyPercent"],
            "protectedItemsCount": pollution_status["protectedItemsCount"],
            "scalingDecision": scaling_result
        }

        self.rolling_history.append(snapshot)

        return {
            "snapshot": snapshot,
            "events": self.decision_logger.get_recent_events(30),
            "objects": [e.to_dict() for e in self.smart_cache.get_entries_list()[:60]],
            "battle": {
                "smart": len(self.smart_cache.entries),
                "lru": len(self.lru_cache.entries),
                "lfu": len(self.lfu_cache.entries),
                "gds": len(self.gds_cache.entries)
            }
        }
