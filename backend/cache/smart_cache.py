"""
Smart Cache Implementation
Flagship Adaptive, Application-Aware Cache with Multi-Factor Scoring, Dynamic TTL, and Pollution Defense.
"""

from typing import Dict, Any, Optional, List
from backend.core.types import CacheStrategy, DecisionType, WorkloadType, SystemConfig
from backend.cache.base_cache import BaseCache, CacheEntry
from backend.cache.smart_scorer import SmartScorer
from backend.cache.ttl_manager import DynamicTTLManager
from backend.cache.pollution_guard import PollutionGuard


class SmartCache(BaseCache):
    def __init__(
        self,
        capacity_bytes: int = SystemConfig.cacheCapacityBytes,
        workload_type: WorkloadType = WorkloadType.READ_HEAVY_API
    ):
        super().__init__(CacheStrategy.SMART, capacity_bytes)
        self.scorer = SmartScorer(workload_type)
        self.ttl_manager = DynamicTTLManager()
        self.pollution_guard = PollutionGuard()
        self.max_item_size_bytes = SystemConfig.maxItemSizeBytes
        self.window_requests = 0
        self.workload_type = workload_type

    def set_workload_type(self, workload_type: WorkloadType):
        self.workload_type = workload_type
        self.scorer.update_weights_for_workload(workload_type)

    def get(self, id: str, current_time: float) -> Dict[str, Any]:
        entry = self.entries.get(id)
        if not entry:
            self.misses += 1
            return {"hit": False, "entry": None}

        age = current_time - entry.created_at

        # Check for expiration
        if age >= entry.current_ttl:
            # Expired
            del self.entries[id]
            self.used_bytes -= entry.size_bytes
            self.misses += 1
            return {"hit": False, "entry": None, "expired": True}

        # HIT
        self.hits += 1
        entry.total_hits += 1
        entry.recent_hits += 1
        entry.last_accessed_at = current_time

        # Check proactive REFRESH
        if age >= entry.current_ttl * 0.75 and entry.score >= 0.45:
            entry.decision = DecisionType.REFRESH.value
            entry.reason = (
                f"Approaching TTL expiration ({round(age)}s / {entry.current_ttl}s). "
                f"Proactive background refresh triggered (Score {round(entry.score, 2)}) to prevent miss stampede."
            )
            self.refreshes += 1
            entry.created_at = current_time  # Refreshed timestamp

        return {"hit": True, "entry": entry}

    def put(self, item: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        item_id = item["id"]
        size_bytes = item.get("sizeBytes", 4096)
        is_pollution = item.get("isPollutionKey", False)

        # Reject single item exceeding full cache
        if size_bytes > self.capacity_bytes:
            return {"admitted": False, "reason": "Object size exceeds total cache capacity"}

        # Pollution Guard evaluation
        self.pollution_guard.record_request(item_id, is_pollution, current_time)
        pollution_status = self.pollution_guard.evaluate(self.get_entries_list(), current_time)
        
        if pollution_status["riskLevel"] == "HIGH" and is_pollution:
            return {"admitted": False, "reason": "Rejected by Cache Pollution Defense: low-reuse crawler key."}

        # Update if already exists
        if item_id in self.entries:
            existing = self.entries[item_id]
            self.used_bytes -= existing.size_bytes
            existing.last_accessed_at = current_time
            existing.total_hits += 1
            existing.recent_hits += 1
            existing.size_bytes = size_bytes
            self.used_bytes += size_bytes
            self.recalculate_entry(existing, current_time)
            return {"admitted": True, "entry": existing}

        # Evict space if needed
        bytes_needed = (self.used_bytes + size_bytes) - self.capacity_bytes
        if bytes_needed > 0:
            self.evict(bytes_needed, current_time)

        # Create new entry
        entry = CacheEntry(
            id=item_id,
            name=item.get("name", item_id),
            category=item.get("category", "General"),
            item_type=item.get("type", "DATA"),
            size_bytes=size_bytes,
            base_db_latency_ms=item.get("baseDbLatencyMs", 50.0),
            recompute_cost_units=item.get("recomputeCostUnits", 1.0),
            update_volatility=item.get("updateVolatility", 0.1),
            created_at=current_time,
            current_ttl=SystemConfig.defaultTTL
        )

        self.entries[item_id] = entry
        self.used_bytes += size_bytes
        self.recalculate_entry(entry, current_time)

        return {"admitted": True, "entry": entry}

    def recalculate_entry(self, entry: CacheEntry, current_time: float) -> CacheEntry:
        context = {
            "current_time": current_time,
            "cache_capacity_bytes": self.capacity_bytes,
            "max_item_size_bytes": self.max_item_size_bytes,
            "total_window_requests": max(1, self.window_requests)
        }

        eval_res = self.scorer.evaluate_object(entry, context)
        ttl_res = self.ttl_manager.compute_ttl(entry, eval_res)

        entry.score = eval_res["finalScore"]
        entry.factors = eval_res["factors"]
        entry.weights = eval_res["weights"]
        entry.prev_ttl = ttl_res["prevTTL"]
        entry.current_ttl = ttl_res["newTTL"]

        age = current_time - entry.created_at

        # Derive explainable decision
        if age >= entry.current_ttl * 0.80 and entry.score >= 0.45:
            entry.decision = DecisionType.REFRESH.value
            entry.reason = (
                f"High-demand item ({entry.total_hits} hits, score {entry.score:.2f}) "
                f"approaching staleness threshold ({int(age)}s / {entry.current_ttl}s). Proactive refresh active."
            )
        elif entry.score >= 0.40:
            entry.decision = DecisionType.RETAIN.value
            entry.reason = (
                f"High frequency ({entry.recent_hits} hits) + retrieval cost ({entry.base_db_latency_ms}ms) "
                f"outweighs footprint. Value Score: {entry.score:.2f}."
            )
        else:
            entry.decision = DecisionType.EVICT.value
            entry.reason = (
                f"Low utility/reuse probability (Score {entry.score:.2f}) "
                f"prioritizes this object for eviction under memory pressure."
            )

        return entry

    def evict(self, bytes_needed: int, current_time: float) -> int:
        freed_bytes = 0
        entries_list = self.get_entries_list()

        # Recalculate all resident entries
        for e in entries_list:
            self.recalculate_entry(e, current_time)

        # Sort: protected items placed at back, lowest score first
        def sort_key(e: CacheEntry):
            is_prot = 1 if self.pollution_guard.is_protected(e.id) else 0
            return (is_prot, e.score)

        entries_list.sort(key=sort_key)

        for victim in entries_list:
            if freed_bytes >= bytes_needed:
                break
            if victim.id in self.entries:
                del self.entries[victim.id]
                self.used_bytes -= victim.size_bytes
                freed_bytes += victim.size_bytes
                self.evictions += 1

        return freed_bytes

    def periodic_maintenance(self, current_time: float, total_window_requests: int):
        self.window_requests = total_window_requests
        self.pollution_guard.evaluate(self.get_entries_list(), current_time)

        for entry in self.entries.values():
            entry.prev_window_hits = entry.recent_hits
            entry.recent_hits = int(entry.recent_hits * 0.7)  # Exponential decay
            self.recalculate_entry(entry, current_time)
