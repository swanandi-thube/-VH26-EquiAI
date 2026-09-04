"""
Database Simulator & Backend Compute Pool
Simulates relational database connections, CPU utilization, queuing delay backpressure, and request latency percentiles.
"""

import math
import random
from typing import Dict, Any, List
from backend.core.types import WorkloadType, SystemConfig


class DatabaseSimulator:
    def __init__(self):
        self.max_connections = SystemConfig.maxDbConnections
        self.base_latency_ms = SystemConfig.baseDbLatencyMs
        self.compute_core_capacity = SystemConfig.computeCoreCapacity
        
        self.active_connections = 12
        self.cpu_utilization_percent = 15.0
        self.current_latency_ms = 45.0
        self.queries_per_second = 0.0

    def process_misses(self, miss_count: int, delta_ms: int, workload_type: str) -> Dict[str, Any]:
        seconds = max(0.01, delta_ms / 1000.0)
        self.queries_per_second = miss_count / seconds

        # Complexity multiplier for Compute-Heavy
        complexity = 2.4 if workload_type == WorkloadType.COMPUTE_HEAVY_REC.value else 1.0

        # Connections scale with query volume
        target_conn = min(
            self.max_connections,
            int(8 + (self.queries_per_second * 0.45 * complexity))
        )
        self.active_connections = int((self.active_connections * 0.7) + (target_conn * 0.3))

        # CPU Utilization %
        # Formula: Base 8% + (QPS / (cores * 22)) * 100 * complexity
        raw_cpu = 8.0 + ((self.queries_per_second / float(self.compute_core_capacity * 22.0)) * 100.0 * complexity)
        self.cpu_utilization_percent = min(99.0, max(8.0, raw_cpu))

        # Queuing latency penalty when DB CPU is high
        queue_depth_penalty = math.pow(self.cpu_utilization_percent / 100.0, 3) * 3.5
        self.current_latency_ms = self.base_latency_ms * (1.0 + queue_depth_penalty) * (1.8 if workload_type == WorkloadType.COMPUTE_HEAVY_REC.value else 1.0)

        return {
            "queriesPerSecond": round(self.queries_per_second, 1),
            "activeConnections": self.active_connections,
            "cpuUtilizationPercent": round(self.cpu_utilization_percent, 1),
            "currentLatencyMs": round(self.current_latency_ms, 1)
        }

    def reset(self):
        self.active_connections = 12
        self.cpu_utilization_percent = 15.0
        self.current_latency_ms = 45.0
        self.queries_per_second = 0.0


class BackendService:
    def __init__(self):
        self.backend_load_percent = 20.0
        self.active_threads = 12

    def process_request_batch(
        self,
        batch_results: List[Dict[str, Any]],
        db_telemetry: Dict[str, Any],
        workload_type: str
    ) -> Dict[str, Any]:
        latencies = []
        total_reqs = max(1, len(batch_results))
        miss_count = sum(1 for r in batch_results if not r["hit"])
        miss_ratio = miss_count / float(total_reqs)

        # Thread utilization
        target_load = min(98.0, 15.0 + (miss_ratio * 65.0) + (total_reqs * 0.15))
        self.backend_load_percent = round((self.backend_load_percent * 0.6) + (target_load * 0.4), 1)
        self.active_threads = min(64, max(4, int((self.backend_load_percent / 100.0) * 64)))

        is_compute_heavy = (workload_type == WorkloadType.COMPUTE_HEAVY_REC.value)

        for res in batch_results:
            is_hit = res["hit"]
            item = res["item"]
            
            if is_hit:
                # Fast in-memory hit: 1.2ms to 4.5ms
                lat = 1.2 + random.random() * 3.2
            else:
                # Cache miss: base DB latency + item penalty + db queue backpressure
                item_base = item.get("baseDbLatencyMs", 45.0)
                recompute = item.get("recomputeCostUnits", 1.0)
                db_queue = (db_telemetry.get("currentLatencyMs", 45.0) - SystemConfig.baseDbLatencyMs)
                
                if is_compute_heavy:
                    lat = (item_base * 0.6) + (recompute * 8.5) + db_queue + random.random() * 25.0
                else:
                    lat = item_base + db_queue + random.random() * 15.0

            latencies.append(round(lat, 2))

        return {
            "latencies": latencies,
            "backendLoadPercent": self.backend_load_percent,
            "activeThreads": self.active_threads
        }

    def reset(self):
        self.backend_load_percent = 20.0
        self.active_threads = 12
