"""
FastAPI Server & Real-Time WebSocket Broadcaster
Adaptive, Application-Aware Cache Management System
"""

import asyncio
import json
import os
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.core.types import (
    WorkloadType, TrafficScenario, CacheStrategy, DecisionType,
    SystemConfig, ScoringWeights
)
from backend.core.simulation_engine import SimulationEngine
from backend.benchmark.engine import DigitalTwinBenchmark
from backend.services.data_importer import DataImporter

app = FastAPI(
    title="EquiAI - Adaptive, Application-Aware Cache Management System",
    version="2.0.0",
    description="Real-Time FastAPI & Observability Platform for Application-Aware Cache Optimization"
)

# CORS middleware for open local access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Simulation Coordinator & Benchmark Engine
sim_engine = SimulationEngine()
benchmark_runner = DigitalTwinBenchmark()

# Active WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, data: Dict[str, Any]):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        for dead in disconnected:
            self.disconnect(dead)

ws_manager = ConnectionManager()


# Background Simulation Task Loop
async def simulation_background_loop():
    while True:
        try:
            if sim_engine.is_running:
                tick_data = sim_engine.tick(delta_ms=250)
                await ws_manager.broadcast_json({
                    "type": "SIMULATION_TICK",
                    "data": tick_data
                })
        except Exception as e:
            print(f"Error in simulation background tick: {e}")
        
        # ~4 ticks per second (250ms interval)
        await asyncio.sleep(0.25)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(simulation_background_loop())
    print("=== Cache Management Simulation Engine background loop started. ===")


# --- REST API Endpoints ---

@app.get("/api/status")
async def get_status():
    return {
        "isRunning": sim_engine.is_running,
        "simTime": sim_engine.current_sim_time,
        "workloadType": sim_engine.workload_generator.workload_type.value,
        "scenario": sim_engine.workload_generator.scenario.value,
        "baseRps": sim_engine.workload_generator.base_rps,
        "capacityGB": sim_engine.cache_capacity_bytes / (1024 * 1024 * 1024),
        "activeClients": len(ws_manager.active_connections)
    }


@app.get("/api/metrics")
async def get_metrics():
    history = list(sim_engine.rolling_history)
    latest = history[-1] if history else None
    return {
        "latest": latest,
        "history": history
    }


@app.get("/api/cache/objects")
async def get_cache_objects():
    entries = [e.to_dict() for e in sim_engine.smart_cache.get_entries_list()]
    return {
        "totalCount": len(entries),
        "capacityBytes": sim_engine.cache_capacity_bytes,
        "usedBytes": sim_engine.smart_cache.used_bytes,
        "usagePercent": sim_engine.smart_cache.get_usage_percent(),
        "objects": entries
    }


@app.get("/api/decisions")
async def get_decisions(limit: int = 40):
    return {
        "events": sim_engine.decision_logger.get_recent_events(limit)
    }


class WorkloadTypeRequest(BaseModel):
    workloadType: str


@app.post("/api/workload/type")
async def set_workload_type(req: WorkloadTypeRequest):
    try:
        wt = WorkloadType(req.workloadType)
        sim_engine.set_workload_type(wt)
        return {"success": True, "workloadType": wt.value}
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid workload type: {req.workloadType}")


class ScenarioRequest(BaseModel):
    scenario: str
    targetItemId: Optional[str] = None
    pollutionRate: Optional[float] = None


@app.post("/api/workload/scenario")
async def set_scenario(req: ScenarioRequest):
    try:
        sc = TrafficScenario(req.scenario)
        opts = {}
        if req.targetItemId:
            opts["targetItemId"] = req.targetItemId
        if req.pollutionRate is not None:
            opts["pollutionRate"] = req.pollutionRate
        sim_engine.set_scenario(sc, opts)
        return {"success": True, "scenario": sc.value}
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scenario: {req.scenario}")


class RpsRequest(BaseModel):
    rps: int


@app.post("/api/workload/rps")
async def set_rps(req: RpsRequest):
    sim_engine.set_base_rps(req.rps)
    return {"success": True, "baseRps": sim_engine.workload_generator.base_rps}


class SpeedRequest(BaseModel):
    speed: float


@app.post("/api/workload/speed")
async def set_speed(req: SpeedRequest):
    sim_engine.set_speed_multiplier(req.speed)
    return {"success": True, "speedMultiplier": sim_engine.workload_generator.speed_multiplier}


class CapacityRequest(BaseModel):
    capacityGB: float


@app.post("/api/cache/capacity")
async def set_capacity(req: CapacityRequest):
    new_bytes = int(req.capacityGB * 1024 * 1024 * 1024)
    sim_engine.set_capacity(new_bytes)
    return {"success": True, "capacityGB": req.capacityGB, "capacityBytes": new_bytes}


@app.post("/api/workload/start")
async def start_simulation():
    sim_engine.is_running = True
    return {"success": True, "isRunning": True}


@app.post("/api/workload/pause")
async def pause_simulation():
    sim_engine.is_running = False
    return {"success": True, "isRunning": False}


@app.post("/api/workload/step")
async def step_simulation():
    tick_data = sim_engine.tick(delta_ms=250)
    return {"success": True, "data": tick_data}


@app.post("/api/cache/reset")
async def reset_cache():
    sim_engine.reset()
    return {"success": True, "message": "Simulation cache and state reset successfully."}


@app.get("/api/scoring/config")
async def get_scoring_config():
    return {
        "autoAdapt": sim_engine.smart_cache.scorer.auto_adapt_weights,
        "currentWorkload": sim_engine.workload_generator.workload_type.value,
        "weights": sim_engine.smart_cache.scorer.weights.model_dump()
    }


class ScoringConfigRequest(BaseModel):
    autoAdapt: Optional[bool] = None
    weights: Optional[Dict[str, float]] = None


@app.post("/api/scoring/config")
async def update_scoring_config(req: ScoringConfigRequest):
    if req.autoAdapt is not None:
        sim_engine.set_auto_adapt_weights(req.autoAdapt)
    if req.weights:
        sim_engine.set_scoring_weights(req.weights)
    return {
        "success": True,
        "autoAdapt": sim_engine.smart_cache.scorer.auto_adapt_weights,
        "weights": sim_engine.smart_cache.scorer.weights.model_dump()
    }


class BenchmarkRunRequest(BaseModel):
    workloadType: Optional[str] = "READ_HEAVY_API"
    scenario: Optional[str] = "STEADY"
    requestCount: Optional[int] = 1200
    cacheCapacityGB: Optional[float] = 2.0


@app.post("/api/benchmark/run")
async def run_benchmark(req: BenchmarkRunRequest):
    try:
        cap_bytes = int((req.cacheCapacityGB or 2.0) * 1024 * 1024 * 1024)
        results = benchmark_runner.run_benchmark(
            workload_type=req.workloadType or "READ_HEAVY_API",
            scenario=req.scenario or "STEADY",
            request_count=req.requestCount or 1200,
            cache_capacity_bytes=cap_bytes
        )
        return {"success": True, "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark execution failed: {str(e)}")


from fastapi import Request

@app.post("/api/data/upload")
async def upload_user_data(request: Request):
    try:
        content_type = request.headers.get("content-type", "")
        
        if "application/json" in content_type:
            body = await request.json()
            if isinstance(body, list):
                success, items, msg = DataImporter.parse_json_items(json.dumps(body))
            elif isinstance(body, dict):
                if "items" in body and isinstance(body["items"], list):
                    success, items, msg = DataImporter.parse_json_items(json.dumps(body["items"]))
                elif "content" in body and isinstance(body["content"], str):
                    raw_text = body["content"].strip()
                    if body.get("format") == "csv" or raw_text.startswith("id,"):
                        success, items, msg = DataImporter.parse_csv_items(raw_text)
                    else:
                        success, items, msg = DataImporter.parse_json_items(raw_text)
                else:
                    # Single item object
                    success, items, msg = DataImporter.parse_json_items(json.dumps([body]))
            else:
                raise HTTPException(status_code=400, detail="Invalid JSON payload structure.")
        else:
            # Raw text (CSV or JSON string)
            raw_bytes = await request.body()
            raw_str = raw_bytes.decode("utf-8").strip()
            if not raw_str:
                raise HTTPException(status_code=400, detail="Uploaded body is empty.")
            
            if raw_str.startswith("id,") or ("," in raw_str.split("\n")[0] and not raw_str.startswith("{") and not raw_str.startswith("[")):
                success, items, msg = DataImporter.parse_csv_items(raw_str)
            else:
                success, items, msg = DataImporter.parse_json_items(raw_str)

        if not success:
            raise HTTPException(status_code=400, detail=msg)

        # Ingest items into live backend engine
        sim_engine.ingest_custom_data(items)

        return {
            "success": True,
            "message": msg,
            "itemCount": len(items),
            "sampleItems": items[:8]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data ingestion error: {str(e)}")


# --- WebSocket Streaming Endpoint ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send initial snapshot immediately upon connect
        initial_tick = sim_engine.tick(delta_ms=250)
        await websocket.send_json({
            "type": "INITIAL_STATE",
            "data": initial_tick
        })

        while True:
            # Handle incoming client commands over WebSocket
            message = await websocket.receive_text()
            try:
                cmd = json.loads(message)
                action = cmd.get("action")
                payload = cmd.get("payload", {})

                if action == "PAUSE":
                    sim_engine.is_running = False
                elif action == "START":
                    sim_engine.is_running = True
                elif action == "STEP":
                    tick_data = sim_engine.tick(delta_ms=250)
                    await websocket.send_json({"type": "SIMULATION_TICK", "data": tick_data})
                elif action == "RESET":
                    sim_engine.reset()
                elif action == "SET_WORKLOAD":
                    wt = WorkloadType(payload.get("workloadType", "READ_HEAVY_API"))
                    sim_engine.set_workload_type(wt)
                elif action == "SET_SCENARIO":
                    sc = TrafficScenario(payload.get("scenario", "STEADY"))
                    sim_engine.set_scenario(sc, payload)
                elif action == "SET_RPS":
                    sim_engine.set_base_rps(int(payload.get("rps", 250)))
                elif action == "SET_CAPACITY":
                    gb = float(payload.get("capacityGB", 2.0))
                    sim_engine.set_capacity(int(gb * 1024 * 1024 * 1024))
            except Exception as cmd_err:
                print(f"Error handling WS command: {cmd_err}")

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# Mount workspace root static files (serving index.html, src/, css/)
workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

@app.get("/")
async def serve_index():
    index_path = os.path.join(workspace_root, "index.html")
    return FileResponse(index_path)

# Static file mount for assets, js, css
app.mount("/src", StaticFiles(directory=os.path.join(workspace_root, "src")), name="src")
app.mount("/css", StaticFiles(directory=os.path.join(workspace_root, "css")), name="css")
