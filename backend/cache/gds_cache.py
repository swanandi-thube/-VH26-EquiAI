"""
Greedy Dual-Size (GDS) Cache
Baseline comparison cache strategy optimizing Cost/Size ratio with an inflation clock L.
"""

from typing import Dict, Any
from backend.core.types import CacheStrategy, SystemConfig
from backend.cache.base_cache import BaseCache, CacheEntry


class GDSCacheEntry(CacheEntry):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.h_value: float = 0.0


class GDSCache(BaseCache):
    def __init__(self, capacity_bytes: int = SystemConfig.cacheCapacityBytes):
        super().__init__(CacheStrategy.GDS, capacity_bytes)
        self.clock_l: float = 0.0
        self.gds_entries: Dict[str, GDSCacheEntry] = {}

    def _calculate_h(self, entry: GDSCacheEntry) -> float:
        # Cost = baseDbLatencyMs * recomputeCostUnits
        cost = max(1.0, entry.base_db_latency_ms * entry.recompute_cost_units)
        # Size in KB to avoid vanishing ratios
        size_kb = max(1.0, entry.size_bytes / 1024.0)
        return self.clock_l + (cost / size_kb)

    def get(self, id: str, current_time: float) -> Dict[str, Any]:
        entry = self.gds_entries.get(id)
        if not entry:
            self.misses += 1
            return {"hit": False, "entry": None}

        self.hits += 1
        entry.total_hits += 1
        entry.last_accessed_at = current_time
        entry.h_value = self._calculate_h(entry)
        return {"hit": True, "entry": entry}

    def put(self, item: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        item_id = item["id"]
        size_bytes = item.get("sizeBytes", 4096)

        if size_bytes > self.capacity_bytes:
            return {"admitted": False, "reason": "Object size exceeds total cache capacity"}

        if item_id in self.gds_entries:
            existing = self.gds_entries[item_id]
            self.used_bytes -= existing.size_bytes
            existing.size_bytes = size_bytes
            existing.last_accessed_at = current_time
            existing.total_hits += 1
            existing.h_value = self._calculate_h(existing)
            self.used_bytes += size_bytes
            return {"admitted": True, "entry": existing}

        bytes_needed = (self.used_bytes + size_bytes) - self.capacity_bytes
        if bytes_needed > 0:
            self.evict(bytes_needed, current_time)

        entry = GDSCacheEntry(
            id=item_id,
            name=item.get("name", item_id),
            category=item.get("category", "General"),
            item_type=item.get("type", "DATA"),
            size_bytes=size_bytes,
            base_db_latency_ms=item.get("baseDbLatencyMs", 50.0),
            recompute_cost_units=item.get("recomputeCostUnits", 1.0),
            update_volatility=item.get("updateVolatility", 0.1),
            created_at=current_time
        )
        entry.h_value = self._calculate_h(entry)

        self.gds_entries[item_id] = entry
        self.entries[item_id] = entry
        self.used_bytes += size_bytes

        return {"admitted": True, "entry": entry}

    def evict(self, bytes_needed: int, current_time: float) -> int:
        freed = 0
        entries_list = list(self.gds_entries.values())
        # Sort by h_value ascending
        entries_list.sort(key=lambda e: e.h_value)

        for victim in entries_list:
            if freed >= bytes_needed:
                break
            self.clock_l = victim.h_value  # Advance clock L
            if victim.id in self.gds_entries:
                del self.gds_entries[victim.id]
            if victim.id in self.entries:
                del self.entries[victim.id]
            self.used_bytes -= victim.size_bytes
            freed += victim.size_bytes
            self.evictions += 1

        return freed

    def clear(self):
        super().clear()
        self.gds_entries.clear()
        self.clock_l = 0.0
