"""
Explanation & Decision Logging System
Maintains a live streaming log of causal decisions and generates transparent, human-readable explanations derived from exact scoring factors.
"""

from collections import deque
import time
from typing import Dict, Any, List, Optional
from backend.core.types import DecisionType


class DecisionLogger:
    def __init__(self, max_events: int = 150):
        self.events: deque = deque(maxlen=max_events)
        self.event_counter = 0

    def log_decision(
        self,
        event_type: str,
        title: str,
        description: str,
        severity: str = "info",
        score: Optional[float] = None,
        factors: Optional[Dict[str, float]] = None,
        item_id: Optional[str] = None,
        timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        self.event_counter += 1
        now_str = time.strftime("%H:%M:%S")

        event = {
            "id": self.event_counter,
            "timeStr": now_str,
            "timestamp": timestamp or round(time.time(), 2),
            "type": event_type,
            "title": title,
            "description": description,
            "severity": severity,
            "score": round(score, 3) if score is not None else None,
            "factors": factors or {},
            "itemId": item_id
        }

        self.events.appendleft(event)
        return event

    def log_cache_action(self, action: str, item_id: str, score: float, reason: str, factors: Dict[str, float], timestamp: float) -> Dict[str, Any]:
        severity = "success" if action == DecisionType.RETAIN.value else ("warning" if action == DecisionType.REFRESH.value else "danger")
        if action == DecisionType.PRE_WARM.value:
            severity = "info"
        elif action in [DecisionType.SCALE_UP.value, DecisionType.SCALE_DOWN.value]:
            severity = "primary"

        title = f"{action} — {item_id}"
        return self.log_decision(
            event_type=action,
            title=title,
            description=reason,
            severity=severity,
            score=score,
            factors=factors,
            item_id=item_id,
            timestamp=timestamp
        )

    def get_recent_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        return list(self.events)[:limit]

    def clear(self):
        self.events.clear()
        self.event_counter = 0
