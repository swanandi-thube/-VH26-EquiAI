"""
Live FastAPI HTTP Test Runner using Requests
"""

import sys
import os
import time
import threading
import requests
import uvicorn

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.app import app

def start_server():
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="warning")

def test_live_api():
    t = threading.Thread(target=start_server, daemon=True)
    t.start()
    time.sleep(1.5)

    base = "http://127.0.0.1:8001"

    # 1. GET /api/status
    r = requests.get(f"{base}/api/status")
    assert r.status_code == 200, f"Status failed: {r.text}"
    print("  GET /api/status OK:", r.json())

    # 2. GET /api/metrics
    r = requests.get(f"{base}/api/metrics")
    assert r.status_code == 200
    print("  GET /api/metrics OK")

    # 3. GET /api/cache/objects
    r = requests.get(f"{base}/api/cache/objects")
    assert r.status_code == 200
    data = r.json()
    assert len(data["objects"]) > 0
    print(f"  GET /api/cache/objects OK: {len(data['objects'])} items resident.")

    # 4. POST /api/workload/type
    r = requests.post(f"{base}/api/workload/type", json={"workloadType": "COMPUTE_HEAVY_REC"})
    assert r.status_code == 200
    print("  POST /api/workload/type OK:", r.json())

    # 5. POST /api/workload/scenario
    r = requests.post(f"{base}/api/workload/scenario", json={"scenario": "POPULARITY_SPIKE"})
    assert r.status_code == 200
    print("  POST /api/workload/scenario OK:", r.json())

    # 6. POST /api/workload/rps
    r = requests.post(f"{base}/api/workload/rps", json={"rps": 350})
    assert r.status_code == 200
    print("  POST /api/workload/rps OK:", r.json())

    # 7. POST /api/cache/capacity
    r = requests.post(f"{base}/api/cache/capacity", json={"capacityGB": 4.0})
    assert r.status_code == 200
    print("  POST /api/cache/capacity OK:", r.json())

    # 8. POST /api/benchmark/run
    r = requests.post(f"{base}/api/benchmark/run", json={
        "workloadType": "READ_HEAVY_API",
        "scenario": "STEADY",
        "requestCount": 300,
        "cacheCapacityGB": 2.0
    })
    assert r.status_code == 200
    bench = r.json()
    assert "data" in bench
    print("  POST /api/benchmark/run OK:", bench["data"]["advantage"]["summary"])

    # 9. POST /api/data/upload (CSV content)
    csv_payload = {"content": "id,name,category,sizeBytes,baseDbLatencyMs,recomputeCostUnits,updateVolatility\nprod_c1,Custom Server,Compute,32768,50.0,2.0,0.1\nprod_c2,Custom DB,Data,65536,90.0,4.0,0.3", "format": "csv"}
    r = requests.post(f"{base}/api/data/upload", json=csv_payload)
    assert r.status_code == 200, f"Upload failed: {r.text}"
    upload_res = r.json()
    assert upload_res["success"] is True
    assert upload_res["itemCount"] == 2
    print("  POST /api/data/upload OK:", upload_res["message"])

    # 10. GET /api/scoring/config
    r = requests.get(f"{base}/api/scoring/config")
    assert r.status_code == 200
    print("  GET /api/scoring/config OK:", r.json())

    # 11. GET /
    r = requests.get(f"{base}/")
    assert r.status_code == 200
    print("  GET / (Static Frontend HTML) OK")


if __name__ == "__main__":
    print("=" * 60)
    print("Running Live FastAPI Server HTTP Integration Tests")
    print("=" * 60)
    test_live_api()
    print("=" * 60)
    print("=== ALL LIVE FASTAPI ENDPOINTS VERIFIED SUCCESSFULLY! ===")
    print("=" * 60)
