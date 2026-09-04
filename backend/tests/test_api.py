"""
Test FastAPI API endpoints and server routes
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_api_endpoints():
    print("Testing FastAPI REST endpoints...")
    
    # 1. GET /api/status
    res = client.get("/api/status")
    assert res.status_code == 200, f"Status failed: {res.text}"
    data = res.json()
    assert "isRunning" in data
    print("  GET /api/status OK:", data)

    # 2. GET /api/metrics
    res = client.get("/api/metrics")
    assert res.status_code == 200
    print("  GET /api/metrics OK")

    # 3. GET /api/cache/objects
    res = client.get("/api/cache/objects")
    assert res.status_code == 200
    obj_data = res.json()
    assert "objects" in obj_data
    assert len(obj_data["objects"]) > 0
    print(f"  GET /api/cache/objects OK: {len(obj_data['objects'])} objects resident.")

    # 4. POST /api/workload/type
    res = client.post("/api/workload/type", json={"workloadType": "COMPUTE_HEAVY_REC"})
    assert res.status_code == 200
    print("  POST /api/workload/type OK:", res.json())

    # 5. POST /api/workload/scenario
    res = client.post("/api/workload/scenario", json={"scenario": "POPULARITY_SPIKE"})
    assert res.status_code == 200
    print("  POST /api/workload/scenario OK:", res.json())

    # 6. POST /api/workload/rps
    res = client.post("/api/workload/rps", json={"rps": 400})
    assert res.status_code == 200
    print("  POST /api/workload/rps OK:", res.json())

    # 7. POST /api/cache/capacity
    res = client.post("/api/cache/capacity", json={"capacityGB": 4.0})
    assert res.status_code == 200
    print("  POST /api/cache/capacity OK:", res.json())

    # 8. POST /api/benchmark/run
    res = client.post("/api/benchmark/run", json={
        "workloadType": "READ_HEAVY_API",
        "scenario": "STEADY",
        "requestCount": 200,
        "cacheCapacityGB": 2.0
    })
    assert res.status_code == 200
    bench_data = res.json()
    assert "data" in bench_data
    assert "advantage" in bench_data["data"]
    print("  POST /api/benchmark/run OK:", bench_data["data"]["advantage"]["summary"])

    # 9. POST /api/data/upload (CSV)
    csv_payload = "id,name,category,sizeBytes,baseDbLatencyMs,recomputeCostUnits,updateVolatility\ncustom_p1,Custom Server,Compute,32768,50.0,2.0,0.1"
    res = client.post("/api/data/upload", data={"json_text": csv_payload})
    # Since csv is passed as text with CSV header, let's test file or text
    print("  POST /api/data/upload test completed")

    # 10. GET /api/scoring/config
    res = client.get("/api/scoring/config")
    assert res.status_code == 200
    print("  GET /api/scoring/config OK:", res.json())


if __name__ == "__main__":
    test_api_endpoints()
    print("=== ALL FASTAPI API ENDPOINT TESTS PASSED! ===")
