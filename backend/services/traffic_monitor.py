"""
Traffic / Workload Monitor & State Detection
Monitors real-time request rates, moving averages, and velocity to classify traffic states:
- 🟢 NORMAL_TRAFFIC
- 🟡 TRAFFIC_INCREASING
- 🔴 TRAFFIC_SPIKE_DETECTED
- 🟠 TRAFFIC_BURST
- 🔵 TRAFFIC_DECREASING
"""

from collections import deque
from typing import Dict, Any, List
from backend.core.types import TrafficState, TrafficScenario


class TrafficMonitor:
    def __init__(self, history_len: int = 20):
        self.history_len = history_len
        self.rps_history: deque = deque(maxlen=history_len)
        self.current_state = TrafficState.NORMAL_TRAFFIC.value
        self.trend_velocity = 0.0
        self.ema_rps = 250.0
        self.alpha = 0.3

    def record_tick(self, current_rps: float, scenario: str) -> Dict[str, Any]:
        self.rps_history.append(current_rps)
        
        # Exponential moving average
        self.ema_rps = (self.alpha * current_rps) + ((1.0 - self.alpha) * self.ema_rps)

        # Velocity: delta over last few samples
        if len(self.rps_history) >= 4:
            recent_avg = sum(list(self.rps_history)[-3:]) / 3.0
            older_avg = sum(list(self.rps_history)[:3]) / 3.0
            self.trend_velocity = recent_avg - older_avg
        else:
            self.trend_velocity = 0.0

        # Scenario-grounded & rate-grounded State Classification
        if scenario == TrafficScenario.TRAFFIC_BURST.value or current_rps >= 800:
            self.current_state = TrafficState.TRAFFIC_BURST.value
            badge = "TRAFFIC BURST"
            status_text = f"High-volume transient burst ({int(current_rps)} req/s). Short duration."
            color = "#f97316"  # Orange
        elif scenario == TrafficScenario.POPULARITY_SPIKE.value or self.trend_velocity > 120 or current_rps >= 500:
            self.current_state = TrafficState.TRAFFIC_SPIKE_DETECTED.value
            badge = "TRAFFIC SPIKE DETECTED"
            status_text = f"Surge detected (+{int(self.trend_velocity)} req/s velocity). Cache pressure elevated."
            color = "#ef4444"  # Red
        elif self.trend_velocity > 35:
            self.current_state = TrafficState.TRAFFIC_INCREASING.value
            badge = "TRAFFIC INCREASING"
            status_text = f"Incoming request volume climbing (+{int(self.trend_velocity)} req/s)."
            color = "#eab308"  # Yellow
        elif self.trend_velocity < -35:
            self.current_state = TrafficState.TRAFFIC_DECREASING.value
            badge = "TRAFFIC DECREASING"
            status_text = f"Traffic demand returning to baseline ({int(current_rps)} req/s)."
            color = "#38bdf8"  # Blue
        else:
            self.current_state = TrafficState.NORMAL_TRAFFIC.value
            badge = "NORMAL TRAFFIC"
            status_text = f"Equilibrium traffic flow at ~{int(current_rps)} req/s."
            color = "#10b981"  # Green

        return {
            "state": self.current_state,
            "badge": badge,
            "statusText": status_text,
            "color": color,
            "currentRps": round(current_rps, 1),
            "emaRps": round(self.ema_rps, 1),
            "trendVelocity": round(self.trend_velocity, 1)
        }
