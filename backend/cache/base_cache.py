"""
Base Cache Definition
Abstract cache manager interface with memory tracking, hit/miss metrics, and evictions.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from backend.core.types import CacheStrategy, DecisionType


class CacheEntry:
    def __init__(
        self,
        id: str,
        name: str,
        category: str,
        item_type: str,
        size_bytes: int,
        base_db_latency_ms: float = 50.0,
        recompute_cost_units: float = 1.0,
        update_volatility: float = 0.1,
        created_at: float = 0.0,
        current_ttl: int = 90
    ):
        self.id = id
        self.name = name
        self.category = category
        self.item_type = item_type
        self.size_bytes = size_bytes
        self.base_db_latency_ms = base_db_latency_ms
        self.recompute_cost_units = recompute_cost_units
        self.update_volatility = update_volatility
        
        self.created_at = created_at
        self.last_accessed_at = created_at
        self.total_hits = 1
        self.recent_hits = 1
        self.prev_window_hits = 0
        
        self.current_ttl = current_ttl
        self.prev_ttl = current_ttl
        self.score = 0.50
        self.decision = DecisionType.RETAIN.value
        self.reason = "Newly admitted into cache store."
        self.factors: Dict[str, float] = {}
        self.weights: Dict[str, float] = {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "type": self.item_type,
            "sizeBytes": self.size_bytes,
            "baseDbLatencyMs": self.base_db_latency_ms,
            "recomputeCostUnits": self.recompute_cost_units,
            "updateVolatility": self.update_volatility,
            "createdAt": self.created_at,
            "lastAccessedAt": self.last_accessed_at,
            "totalHits": self.total_hits,
            "recentHits": self.recent_hits,
            "currentTTL": self.current_ttl,
            "prevTTL": self.prev_ttl,
            "score": round(self.score, 3),
            "decision": self.decision,
            "reason": self.reason,
            "factors": self.factors,
            "weights": self.weights
        }


class BaseCache(ABC):
    def __init__(self, strategy: CacheStrategy, capacity_bytes: int):
        self.strategy = strategy
        self.capacity_bytes = capacity_bytes
        self.used_bytes = 0
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        self.refreshes = 0
        self.entries: Dict[str, CacheEntry] = {}

    @abstractmethod
    def get(self, id: str, current_time: float) -> Dict[str, Any]:
        pass

    @abstractmethod
    def put(self, item: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        pass

    @abstractmethod
    def evict(self, bytes_needed: int, current_time: float) -> int:
        pass

    def get_hit_rate(self) -> float:
        total = self.hits + self.misses
        return (self.hits / total) if total > 0 else 0.0

    def get_usage_percent(self) -> float:
        return (self.used_bytes / self.capacity_bytes * 100.0) if self.capacity_bytes > 0 else 0.0

    def set_capacity(self, new_capacity_bytes: int):
        self.capacity_bytes = new_capacity_bytes
        if self.used_bytes > self.capacity_bytes:
            self.evict(self.used_bytes - self.capacity_bytes, 0.0)

    def clear(self):
        self.entries.clear()
        self.used_bytes = 0
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        self.refreshes = 0

    def get_entries_list(self) -> List[CacheEntry]:
        return list(self.entries.values())
