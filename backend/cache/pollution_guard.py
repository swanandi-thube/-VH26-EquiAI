"""
Cache Pollution Defense System
Detects unique key deluges (crawlers, scans, scrapers) and shields high-value resident objects from cache thrashing.
"""

from collections import deque
from typing import Dict, Any, List, Set
from backend.core.types import PollutionRisk


class PollutionGuard:
    def __init__(self, window_size: int = 150):
        self.window_size = window_size
        self.request_history: deque = deque(maxlen=window_size)
        self.key_counts: Dict[str, int] = {}
        self.risk_level = PollutionRisk.LOW.value
        self.unique_key_rate = 0.0
        self.useful_occupancy = 85.0
        self.protected_keys: Set[str] = set()

    def record_request(self, key: str, is_pollution_key: bool = False, current_time: float = 0.0):
        if len(self.request_history) == self.window_size:
            oldest_key = self.request_history[0]
            if oldest_key in self.key_counts:
                self.key_counts[oldest_key] -= 1
                if self.key_counts[oldest_key] <= 0:
                    del self.key_counts[oldest_key]

        self.request_history.append(key)
        self.key_counts[key] = self.key_counts.get(key, 0) + 1

    def evaluate(self, resident_entries: List[Any], current_time: float) -> Dict[str, Any]:
        total_recent = len(self.request_history)
        if total_recent == 0:
            return self.get_status()

        unique_keys = len(self.key_counts)
        self.unique_key_rate = unique_keys / float(total_recent)

        # Risk Classification
        if self.unique_key_rate > 0.65:
            self.risk_level = PollutionRisk.HIGH.value
        elif self.unique_key_rate > 0.40:
            self.risk_level = PollutionRisk.MEDIUM.value
        else:
            self.risk_level = PollutionRisk.LOW.value

        # Calculate useful occupancy & select shielded items
        self.protected_keys.clear()
        useful_count = 0
        
        for entry in resident_entries:
            score = getattr(entry, "score", 0.5)
            hits = getattr(entry, "total_hits", 1)
            
            # High utility items get protected
            if score >= 0.50 or hits >= 3:
                useful_count += 1
                if self.risk_level in [PollutionRisk.HIGH.value, PollutionRisk.MEDIUM.value]:
                    self.protected_keys.add(getattr(entry, "id", ""))
            elif score >= 0.35:
                useful_count += 1

        total_resident = max(1, len(resident_entries))
        self.useful_occupancy = (useful_count / float(total_resident)) * 100.0

        return self.get_status()

    def is_protected(self, key: str) -> bool:
        return key in self.protected_keys

    def get_status(self) -> Dict[str, Any]:
        return {
            "riskLevel": self.risk_level,
            "uniqueKeyRatePercent": round(self.unique_key_rate * 100.0, 1),
            "usefulOccupancyPercent": round(self.useful_occupancy, 1),
            "protectedItemsCount": len(self.protected_keys),
            "windowRequests": len(self.request_history)
        }
