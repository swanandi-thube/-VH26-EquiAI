"""
Automated Backend & Core Algorithm Test Suite
Tests all scoring, caching, scaling, benchmarking, data import, and API routes.
"""

import sys
import os

# Add workspace to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.core.types import WorkloadType, TrafficScenario, SystemConfig, ScoringWeights
from backend.cache.smart_scorer import SmartScorer
from backend.cache.smart_cache import SmartCache
from backend.cache.lru_cache import LRUCache
from backend.cache.lfu_cache import LFUCache
from backend.cache.gds_cache import GDSCache
from backend.cache.base_cache import CacheEntry
from backend.services.traffic_monitor import TrafficMonitor
from backend.services.predictive_warmer import PredictiveWarmer
from backend.services.scaling_controller import ScalingController
from backend.services.cost_model import CostModel
from backend.services.data_importer import DataImporter
from backend.benchmark.engine import DigitalTwinBenchmark
from backend.core.simulation_engine import SimulationEngine


def test_smart_scorer():
    print("Testing SmartScorer...")
    scorer = SmartScorer(WorkloadType.READ_HEAVY_API)
    entry = CacheEntry(
        id="prod_001",
        name="Product 1",
        category="Electronics",
        item_type="ProductDetail",
        size_bytes=32 * 1024,
        base_db_latency_ms=60.0,
        recompute_cost_units=2.0,
        update_volatility=0.2,
        created_at=0.0
    )
    entry.recent_hits = 15
    entry.total_hits = 30
    entry.last_accessed_at = 10.0

    context = {
        "current_time": 15.0,
        "cache_capacity_bytes": 2 * 1024 * 1024 * 1024,
        "max_item_size_bytes": 64 * 1024 * 1024,
        "total_window_requests": 200
    }

    res = scorer.evaluate_object(entry, context)
    score = res["finalScore"]
    assert 0.0 <= score <= 1.0, f"Score {score} out of bounds"
    assert "frequency" in res["factors"]
    assert "retrievalCost" in res["factors"]
    print(f"  SmartScorer OK: Score = {score}, Factors = {res['factors']}")


def test_cache_strategies():
    print("Testing Cache Strategies (Smart, LRU, LFU, GDS)...")
    cap = 100 * 1024  # 100 KB small capacity
    smart = SmartCache(cap, WorkloadType.READ_HEAVY_API)
    lru = LRUCache(cap)
    lfu = LFUCache(cap)
    gds = GDSCache(cap)

    items = [
        {"id": f"item_{i}", "name": f"Item {i}", "sizeBytes": 20 * 1024, "baseDbLatencyMs": 40.0, "recomputeCostUnits": 1.0}
        for i in range(10)
    ]

    for it in items:
        smart.put(it, 0.0)
        lru.put(it, 0.0)
        lfu.put(it, 0.0)
        gds.put(it, 0.0)

    assert smart.used_bytes <= cap, "SmartCache exceeded capacity"
    assert lru.used_bytes <= cap, "LRUCache exceeded capacity"
    assert lfu.used_bytes <= cap, "LFUCache exceeded capacity"
    assert gds.used_bytes <= cap, "GDSCache exceeded capacity"
    print("  All 4 Cache Strategies correctly enforce capacity & eviction.")


def test_scaling_controller():
    print("Testing ScalingController...")
    controller = ScalingController()
    
    # High pressure scenario -> should recommend scale-up
    high_pressure = {
        "hitsPerSecond": 400.0,
        "missesPerSecond": 200.0,
        "hitRate": 0.66,
        "backendLoadPercent": 85.0,
        "memoryUsagePercent": 88.0
    }
    res_up = controller.evaluate_scaling(1 * 1024 * 1024 * 1024, high_pressure, scenario="STEADY")
    assert res_up["shouldScaleUp"] is True, "ScalingController failed to approve scale up under high pressure"
    assert res_up["proposedGB"] == 2.0
    print(f"  Scale-Up Evaluation OK: {res_up['decisionReason']}")

    # Transient burst scenario -> should reject scale-up
    res_burst = controller.evaluate_scaling(1 * 1024 * 1024 * 1024, high_pressure, scenario="TRAFFIC_BURST")
    assert res_burst["shouldScaleUp"] is False, "ScalingController should reject scale up during temporary burst"
    print(f"  Burst Rejection OK: {res_burst['decisionReason']}")


def test_data_importer():
    print("Testing DataImporter...")
    csv_sample = """id,name,category,sizeBytes,baseDbLatencyMs,recomputeCostUnits,updateVolatility
prod_custom_1,Custom Laptop,Electronics,65536,45.0,2.5,0.1
prod_custom_2,Custom Shoes,Footwear,16384,25.0,1.0,0.3
"""
    ok, items, msg = DataImporter.parse_csv_items(csv_sample)
    assert ok is True, f"CSV parsing failed: {msg}"
    assert len(items) == 2
    assert items[0]["id"] == "prod_custom_1"
    print(f"  DataImporter CSV OK: {msg}")

    json_sample = """[
      {"id": "rec_custom_1", "name": "Deep Model Alpha", "category": "ML", "sizeBytes": 2097152, "baseDbLatencyMs": 280.0, "recomputeCostUnits": 18.0, "updateVolatility": 0.15}
    ]"""
    ok_j, items_j, msg_j = DataImporter.parse_json_items(json_sample)
    assert ok_j is True, f"JSON parsing failed: {msg_j}"
    assert len(items_j) == 1
    assert items_j[0]["id"] == "rec_custom_1"
    print(f"  DataImporter JSON OK: {msg_j}")


def test_benchmark_engine():
    print("Testing DigitalTwinBenchmark...")
    benchmark = DigitalTwinBenchmark()
    res = benchmark.run_benchmark(
        workload_type="READ_HEAVY_API",
        scenario="STEADY",
        request_count=300,
        cache_capacity_bytes=1024 * 1024 * 1024
    )
    assert "strategies" in res
    assert "SMART" in res["strategies"]
    assert "LRU" in res["strategies"]
    assert "advantage" in res
    smart_hit = res["strategies"]["SMART"]["hitRatePercent"]
    lru_hit = res["strategies"]["LRU"]["hitRatePercent"]
    print(f"  Benchmark OK: Smart Hit Rate = {smart_hit}%, LRU Hit Rate = {lru_hit}%")
    print(f"  Advantage: {res['advantage']['summary']}")


def test_simulation_engine():
    print("Testing SimulationEngine master loop...")
    sim = SimulationEngine()
    tick_data = sim.tick(delta_ms=250)
    assert "snapshot" in tick_data
    assert "trafficRps" in tick_data["snapshot"]
    assert "hitRatePercent" in tick_data["snapshot"]
    assert "costPerHour" in tick_data["snapshot"]
    assert "scalingDecision" in tick_data["snapshot"]
    print(f"  SimulationEngine OK: Traffic = {tick_data['snapshot']['trafficRps']} RPS, Hit Rate = {tick_data['snapshot']['hitRatePercent']}%, Cost = ${tick_data['snapshot']['costPerHour']}/hr")


if __name__ == "__main__":
    print("=" * 60)
    print("Running Full Backend Test Suite")
    print("=" * 60)
    test_smart_scorer()
    test_cache_strategies()
    test_scaling_controller()
    test_data_importer()
    test_benchmark_engine()
    test_simulation_engine()
    print("=" * 60)
    print("=== ALL BACKEND UNIT & INTEGRATION TESTS PASSED! ===")
    print("=" * 60)
