"""
Digital Twin Benchmark Engine
Executes deterministic synchronous comparisons feeding identical request streams into Smart Cache, LRU, LFU, and GDS.
"""

import time
from typing import Dict, Any, List, Optional
from backend.core.types import WorkloadType, TrafficScenario, SystemConfig
from backend.cache.smart_cache import SmartCache
from backend.cache.lru_cache import LRUCache
from backend.cache.lfu_cache import LFUCache
from backend.cache.gds_cache import GDSCache
from backend.services.database_sim import DatabaseSimulator, BackendService
from backend.services.cost_model import CostModel
from backend.workload.generator import WorkloadGenerator
from backend.workload.catalog import ItemCatalog


class DigitalTwinBenchmark:
    def __init__(self):
        self.cost_model = CostModel()

    def run_benchmark(
        self,
        workload_type: str = "READ_HEAVY_API",
        scenario: str = "STEADY",
        request_count: int = 1200,
        cache_capacity_bytes: int = SystemConfig.cacheCapacityBytes,
        custom_items: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        wt = WorkloadType(workload_type)
        sc = TrafficScenario(scenario)

        # 1. Initialize identical instances for each strategy
        strategies = {
            "SMART": {
                "cache": SmartCache(cache_capacity_bytes, wt),
                "db": DatabaseSimulator(),
                "backend": BackendService(),
                "latencies": []
            },
            "LRU": {
                "cache": LRUCache(cache_capacity_bytes),
                "db": DatabaseSimulator(),
                "backend": BackendService(),
                "latencies": []
            },
            "LFU": {
                "cache": LFUCache(cache_capacity_bytes),
                "db": DatabaseSimulator(),
                "backend": BackendService(),
                "latencies": []
            },
            "GDS": {
                "cache": GDSCache(cache_capacity_bytes),
                "db": DatabaseSimulator(),
                "backend": BackendService(),
                "latencies": []
            }
        }

        # 2. Generate deterministic identical request trace
        catalog = ItemCatalog()
        if custom_items:
            catalog.read_heavy_catalog = custom_items
            catalog.compute_heavy_catalog = custom_items

        generator = WorkloadGenerator(catalog)
        generator.set_workload_type(wt)
        generator.set_scenario(sc)
        generator.set_base_rps(300)

        requests = []
        step_delta_ms = 50
        sim_time = 0.0

        while len(requests) < request_count:
            sim_time += step_delta_ms / 1000.0
            batch = generator.tick(step_delta_ms)
            for req in batch["requests"]:
                req_with_ts = dict(req)
                req_with_ts["timestamp"] = sim_time
                requests.append(req_with_ts)
                if len(requests) >= request_count:
                    break

        # 3. Replay exact trace across all 4 cache strategies
        for req in requests:
            req_id = req["id"]
            req_ts = req["timestamp"]

            for strat_key, strat in strategies.items():
                res = strat["cache"].get(req_id, req_ts)
                if not res["hit"]:
                    strat["cache"].put(req, req_ts)

                db_res = strat["db"].process_misses(0 if res["hit"] else 1, 50, wt.value)
                backend_res = strat["backend"].process_request_batch(
                    [{"hit": res["hit"], "item": req}],
                    db_res,
                    wt.value
                )
                strat["latencies"].append(backend_res["latencies"][0])

        # 4. Compute comprehensive results for each strategy
        results = {}
        effective_rps = 300.0

        for key, strat in strategies.items():
            sorted_latencies = sorted(strat["latencies"])
            n = len(sorted_latencies)
            p50 = sorted_latencies[int(n * 0.50)] if n > 0 else 2.5
            p95 = sorted_latencies[int(n * 0.95)] if n > 0 else 15.0
            p99 = sorted_latencies[int(n * 0.99)] if n > 0 else 55.0

            total_reqs = strat["cache"].hits + strat["cache"].misses
            hit_rate = (strat["cache"].hits / float(total_reqs)) if total_reqs > 0 else 0.0
            miss_rate = 1.0 - hit_rate

            cost_telemetry = {
                "cacheCapacityBytes": cache_capacity_bytes,
                "usedBytes": strat["cache"].used_bytes,
                "hitsPerSecond": effective_rps * hit_rate,
                "missesPerSecond": effective_rps * miss_rate,
                "backendLoadPercent": strat["backend"].backend_load_percent,
                "dbQueriesPerSecond": effective_rps * miss_rate
            }

            cost_res = self.cost_model.compute_cost(cost_telemetry)

            results[key] = {
                "name": "Smart Cache (Adaptive)" if key == "SMART" else key,
                "hitRatePercent": round(hit_rate * 100.0, 1),
                "missRatePercent": round(miss_rate * 100.0, 1),
                "p50LatencyMs": round(p50, 1),
                "p95LatencyMs": round(p95, 1),
                "p99LatencyMs": round(p99, 1),
                "backendLoadPercent": strat["backend"].backend_load_percent,
                "dbCpuPercent": strat["db"].cpu_utilization_percent,
                "dbLatencyMs": strat["db"].current_latency_ms,
                "dbConnections": strat["db"].active_connections,
                "evictions": strat["cache"].evictions,
                "refreshes": strat["cache"].refreshes,
                "memoryUsedMB": round(strat["cache"].used_bytes / (1024.0 * 1024.0), 1),
                "costPerHour": cost_res["totalCostPerHour"],
                "costSavingsPerHour": cost_res["costSavingsPerHour"],
                "entriesCount": len(strat["cache"].entries)
            }

        smart = results["SMART"]
        lru = results["LRU"]

        hit_gain = round(smart["hitRatePercent"] - lru["hitRatePercent"], 1)
        p99_reduc = round(((lru["p99LatencyMs"] - smart["p99LatencyMs"]) / max(0.1, lru["p99LatencyMs"])) * 100)
        savings_gain = round(smart["costSavingsPerHour"] - lru["costSavingsPerHour"], 3)
        db_cpu_reduc = round(lru["dbCpuPercent"] - smart["dbCpuPercent"], 1)

        advantage = {
            "hitRateGainVsLru": hit_gain,
            "p99LatencyReductionVsLruPercent": p99_reduc,
            "costSavingsGainVsLru": savings_gain,
            "dbCpuReductionVsLru": db_cpu_reduc,
            "summary": (
                f"Smart Cache achieved {smart['hitRatePercent']}% hit rate (+{hit_gain}% vs LRU), "
                f"reducing P99 latency by {p99_reduc}% and saving ${smart['costSavingsPerHour']:.3f}/hr in infrastructure costs."
            )
        }

        return {
            "workloadType": workload_type,
            "scenario": scenario,
            "requestCount": request_count,
            "timestamp": time.strftime("%H:%M:%S"),
            "strategies": results,
            "advantage": advantage
        }
