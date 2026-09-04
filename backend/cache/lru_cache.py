"""
Least Recently Used (LRU) Cache
Baseline comparison cache strategy that evicts the item not accessed for the longest time.
"""

from collections import OrderedDict
from typing import Dict, Any
from backend.core.types import CacheStrategy, SystemConfig
from backend.cache.base_cache import BaseCache, CacheEntry


class LRUCache(BaseCache):
    def __init__(self, capacity_bytes: int = SystemConfig.cacheCapacityBytes):
        super().__init__(CacheStrategy.LRU, capacity_bytes)
        self.order: OrderedDict[str, CacheEntry] = OrderedDict()

    def get(self, id: str, current_time: float) -> Dict[str, Any]:
        if id not in self.order:
            self.misses += 1
            return {"hit": False, "entry": None}

        entry = self.order[id]
        self.order.move_to_end(id)
        self.hits += 1
        entry.total_hits += 1
        entry.last_accessed_at = current_time
        return {"hit": True, "entry": entry}

    def put(self, item: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        item_id = item["id"]
        size_bytes = item.get("sizeBytes", 4096)

        if size_bytes > self.capacity_bytes:
            return {"admitted": False, "reason": "Object size exceeds total cache capacity"}

        if item_id in self.order:
            existing = self.order[item_id]
            self.used_bytes -= existing.size_bytes
            existing.size_bytes = size_bytes
            existing.last_accessed_at = current_time
            existing.total_hits += 1
            self.used_bytes += size_bytes
            self.order.move_to_end(item_id)
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

        self.order[item_id] = entry
        self.entries[item_id] = entry
        self.used_bytes += size_bytes

        return {"admitted": True, "entry": entry}

    def evict(self, bytes_needed: int, current_time: float) -> int:
        freed = 0
        while self.order and freed < bytes_needed:
            victim_id, victim_entry = self.order.popitem(last=False)
            if victim_id in self.entries:
                del self.entries[victim_id]
            self.used_bytes -= victim_entry.size_bytes
            freed += victim_entry.size_bytes
            self.evictions += 1
        return freed

    def clear(self):
        super().clear()
        self.order.clear()
