"""
Least Frequently Used (LFU) Cache
Baseline comparison cache strategy that evicts the item with the lowest historical access frequency.
"""

from typing import Dict, Any
from backend.core.types import CacheStrategy, SystemConfig
from backend.cache.base_cache import BaseCache, CacheEntry


class LFUCache(BaseCache):
    def __init__(self, capacity_bytes: int = SystemConfig.cacheCapacityBytes):
        super().__init__(CacheStrategy.LFU, capacity_bytes)

    def get(self, id: str, current_time: float) -> Dict[str, Any]:
        entry = self.entries.get(id)
        if not entry:
            self.misses += 1
            return {"hit": False, "entry": None}

        self.hits += 1
        entry.total_hits += 1
        entry.last_accessed_at = current_time
        return {"hit": True, "entry": entry}

    def put(self, item: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        item_id = item["id"]
        size_bytes = item.get("sizeBytes", 4096)

        if size_bytes > self.capacity_bytes:
            return {"admitted": False, "reason": "Object size exceeds total cache capacity"}

        if item_id in self.entries:
            existing = self.entries[item_id]
            self.used_bytes -= existing.size_bytes
            existing.size_bytes = size_bytes
            existing.last_accessed_at = current_time
            existing.total_hits += 1
            self.used_bytes += size_bytes
            return {"admitted": True, "entry": existing}

        bytes_needed = (self.used_bytes + size_bytes) - self.capacity_bytes
        if bytes_needed > 0:
            self.evict(bytes_needed, current_time)

        entry = CacheEntry(
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

        self.entries[item_id] = entry
        self.used_bytes += size_bytes

        return {"admitted": True, "entry": entry}

    def evict(self, bytes_needed: int, current_time: float) -> int:
        freed = 0
        entries_list = list(self.entries.values())
        # Sort by total_hits ascending, then last_accessed_at ascending
        entries_list.sort(key=lambda e: (e.total_hits, e.last_accessed_at))

        for victim in entries_list:
            if freed >= bytes_needed:
                break
            if victim.id in self.entries:
                del self.entries[victim.id]
                self.used_bytes -= victim.size_bytes
                freed += victim.size_bytes
                self.evictions += 1

        return freed
