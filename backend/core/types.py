"""
Core Types, Enums, and Configuration Constants
Adaptive, Application-Aware Cache Management System
"""

from enum import Enum
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field


class WorkloadType(str, Enum):
    READ_HEAVY_API = "READ_HEAVY_API"
    COMPUTE_HEAVY_REC = "COMPUTE_HEAVY_REC"


class TrafficScenario(str, Enum):
    STEADY = "STEADY"
    POPULARITY_SPIKE = "POPULARITY_SPIKE"
    GRADUAL_SHIFT = "GRADUAL_SHIFT"
    COLD_START = "COLD_START"
    TRAFFIC_BURST = "TRAFFIC_BURST"
    CACHE_POLLUTION = "CACHE_POLLUTION"


class TrafficState(str, Enum):
    NORMAL_TRAFFIC = "NORMAL_TRAFFIC"
    TRAFFIC_INCREASING = "TRAFFIC_INCREASING"
    TRAFFIC_SPIKE_DETECTED = "TRAFFIC_SPIKE_DETECTED"
    TRAFFIC_BURST = "TRAFFIC_BURST"
    TRAFFIC_DECREASING = "TRAFFIC_DECREASING"


class CacheStrategy(str, Enum):
    SMART = "SMART"
    LRU = "LRU"
    LFU = "LFU"
    GDS = "GDS"


class DecisionType(str, Enum):
    RETAIN = "RETAIN"
    REFRESH = "REFRESH"
    EVICT = "EVICT"
    PRE_WARM = "PRE_WARM"
    SCALE_UP = "SCALE_UP"
    SCALE_DOWN = "SCALE_DOWN"


class PollutionRisk(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ScoringWeights(BaseModel):
    frequency: float = 0.25
    recency: float = 0.20
    popularity: float = 0.20
    retrievalCost: float = 0.15
    freshness: float = 0.15
    trend: float = 0.10
    reuseProbability: float = 0.10
    sizePenalty: float = 0.15


class PricingConfig(BaseModel):
    cacheMemoryPerHourPerGB: float = 0.040      # $0.040 / GB-hr (Redis/ElastiCache)
    backendComputePerHourPerCore: float = 0.055 # $0.055 / Core-hr
    databaseQueryCostPer10k: float = 0.015      # $0.015 per 10,000 DB queries
    cacheHitRequestCostPer10k: float = 0.001    # $0.001 per 10,000 fast lookups
    missLatencyPenaltyMultiplier: float = 1.8   # SLA penalty multiplier


class SystemConfig:
    cacheCapacityBytes: int = 2 * 1024 * 1024 * 1024  # 2 GB baseline
    minItemSizeBytes: int = 4 * 1024                   # 4 KB
    maxItemSizeBytes: int = 64 * 1024 * 1024           # 64 MB
    
    baseRps: int = 250
    trafficSpeedMultiplier: float = 1.0
    tickIntervalMs: int = 250
    
    # Read-Heavy weights
    readHeavyWeights = ScoringWeights(
        frequency=0.25,
        recency=0.20,
        popularity=0.20,
        retrievalCost=0.15,
        freshness=0.15,
        trend=0.10,
        reuseProbability=0.10,
        sizePenalty=0.15
    )
    
    # Compute-Heavy weights (heavily emphasizes recompute cost & reuse probability)
    computeHeavyWeights = ScoringWeights(
        frequency=0.15,
        recency=0.10,
        popularity=0.15,
        retrievalCost=0.35,
        freshness=0.10,
        trend=0.15,
        reuseProbability=0.20,
        sizePenalty=0.20
    )
    
    minTTL: int = 15
    maxTTL: int = 600
    defaultTTL: int = 90
    
    pricing = PricingConfig()
    
    maxDbConnections: int = 100
    baseDbLatencyMs: float = 45.0
    computeCoreCapacity: int = 16


def format_bytes(b: int) -> str:
    if b == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    val = float(b)
    while val >= 1024 and i < len(units) - 1:
        val /= 1024.0
        i += 1
    return f"{val:.2f} {units[i]}"
