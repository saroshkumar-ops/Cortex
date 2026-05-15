"""FastAPI HTTP layer over pce.Engine.

This is the demo-time wrapper. The bench submission (pce/) doesn't depend on
this — judges import pce.adapter.Engine directly from their harness.

Endpoints fall in two camps:
  - Legacy-shaped: /api/graph, /api/prediction, /api/incidents, /api/actions,
    /api/config, /health, /api/notifications/status. These match the shapes
    the existing Cortex frontend already consumes (see frontend/src/store/cortex.ts).
  - PCE-native: /api/pce/ingest, /api/pce/reconstruct, /api/pce/context,
    /api/pce/stats. These expose the real Context shape for the new PCE UI
    affordances.

Run with:  uvicorn server.main:app --host 0.0.0.0 --port 8000
"""

import json
import os
import threading
import time
from typing import Any

import asyncio
from fastapi import FastAPI, HTTPException, UploadFile, File, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pce.adapter import Engine
from server import projection


app = FastAPI(title="PCE Engine HTTP", version="0.1.0")

# Frontend served from a different port during dev — wide-open CORS for the demo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)


_engine = Engine()
_engine_lock = threading.Lock()
# Most-recent reconstruction kept for GET /api/prediction
_last_signal: dict | None = None
_last_context: dict | None = None
_last_action_plan: dict | None = None
_started_at = time.time()


def _autoload_sample() -> None:
    """If a sample JSONL is set via PCE_AUTOLOAD, ingest it on startup so the
    dashboard has something to show without a manual upload step."""
    path = os.environ.get("PCE_AUTOLOAD")
    if not path or not os.path.isfile(path):
        return
    events = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    with _engine_lock:
        _engine.ingest(events)


@app.on_event("startup")
def _startup() -> None:
    _autoload_sample()


# ---------- legacy-shaped endpoints (drive the existing Cortex dashboard) -------

@app.get("/api/graph")
def get_graph() -> dict:
    with _engine_lock:
        return projection.project_graph(_engine)


@app.get("/api/prediction")
def get_prediction() -> dict:
    global _last_context, _last_action_plan, _last_signal
    if _last_context is None or _last_signal is None:
        return {"prediction": {}, "action_plan": None}
    return {
        "prediction": projection.project_prediction_from_context(
            _last_context, _last_signal.get("incident_id")
        ) or {},
        "action_plan": _last_action_plan,
    }


@app.get("/api/incidents")
def get_incidents(limit: int = 100) -> dict:
    with _engine_lock:
        return {"action_plans": projection.project_incidents(_engine, limit=limit)}


@app.get("/api/actions")
def get_actions(limit: int = 100) -> dict:
    with _engine_lock:
        return {"actions": projection.project_action_records(_engine, limit=limit)}


@app.get("/api/config")
def get_config() -> dict:
    return {
        "dry_run": True,
        "confidence_threshold": 0.5,
        "prediction_horizon_minutes": 0,
        "graph_update_interval_seconds": 2,
        "k8s_namespace": "n/a (retrospective engine)",
    }


@app.patch("/api/config")
def patch_config(body: dict = Body(...)) -> dict:
    # PCE has no live tunables; accept-and-ignore so the Settings page works.
    return {"ok": True, "accepted": body}


@app.get("/api/notifications/status")
def notifications_status() -> dict:
    return {
        "slack":  {"configured": False, "webhook_preview": None},
        "notion": {"configured": False, "database_id_preview": None},
        "github": {"configured": False, "repo": None},
        "cooldown_seconds": 0,
    }


@app.get("/health")
def health() -> dict:
    with _engine_lock:
        services = projection._coalesced_services(_engine)
        return {
            "status": "ok",
            "tick_id": len(_engine.log),
            "cache_age_ms": 0,
            "is_stale": False,
            "warmup_remaining": 0,
            "shadow_mode": False,
            "dry_run": True,
            "consecutive_errors": 0,
            "ws_clients": 0,
            "services": services,
            "uptime_s": round(time.time() - _started_at, 1),
        }


# ---------- PCE-native endpoints (demo flow) ---------------------------------

@app.post("/api/pce/ingest")
def ingest_events(body: dict = Body(...)) -> dict:
    """Ingest a list of events. Body: {"events": [...]}."""
    events = body.get("events") or []
    if not isinstance(events, list):
        raise HTTPException(400, "expected body.events to be a list of event dicts")
    with _engine_lock:
        _engine.ingest(events)
    return {"ingested": len(events), "total_events": len(_engine.log)}


@app.post("/api/pce/ingest_file")
def ingest_file(file: UploadFile = File(...)) -> dict:
    """Ingest a JSONL file upload."""
    contents = file.file.read().decode("utf-8")
    events: list[dict] = []
    for line in contents.splitlines():
        line = line.strip()
        if not line:
            continue
        events.append(json.loads(line))
    with _engine_lock:
        _engine.ingest(events)
    return {"ingested": len(events), "total_events": len(_engine.log)}


@app.post("/api/pce/reconstruct")
def reconstruct(body: dict = Body(...)) -> dict:
    """Reconstruct context for a signal.

    Body either:
      {"signal": {...full incident_signal event...}, "mode": "fast"|"deep"}
      or
      {"incident_id": "INC-714", "mode": "fast"}   (signal must already be ingested)
    """
    global _last_context, _last_action_plan, _last_signal
    mode = body.get("mode") or "fast"
    signal = body.get("signal")
    if not signal:
        inc_id = body.get("incident_id")
        if not inc_id:
            raise HTTPException(400, "provide either body.signal or body.incident_id")
        with _engine_lock:
            ids = _engine.indices.ids_for_incident(inc_id)
            if not ids:
                raise HTTPException(404, f"incident {inc_id} not in memory")
            signal = _engine.log.get(ids[0])

    with _engine_lock:
        ctx = _engine.reconstruct_context(signal, mode=mode)
        _last_signal = signal
        _last_context = ctx
        _last_action_plan = projection.project_action_plan_from_context(_engine, signal, ctx)

    return {
        "signal": signal,
        "mode": mode,
        "context": ctx,
        "action_plan": _last_action_plan,
    }


@app.get("/api/pce/context")
def last_context() -> dict:
    if _last_context is None:
        return {"context": None, "signal": None}
    return {"context": _last_context, "signal": _last_signal, "action_plan": _last_action_plan}


@app.get("/api/pce/stats")
def stats() -> dict:
    with _engine_lock:
        return {
            "events": len(_engine.log),
            "services_known": len(_engine.indices.by_service),
            "incidents_registered": len(_engine.matcher.all_incident_ids()),
            "incidents_resolved": len(_engine._resolved),
            "rename_chain_size": len(_engine.identity._successor),
            "log_templates": _engine.templates.count(),
            "log_observations": _engine.templates.total_observations(),
            "log_compression_ratio": round(_engine.templates.compression_ratio(), 2),
            "uptime_s": round(time.time() - _started_at, 1),
        }


@app.get("/api/pce/templates")
def list_templates(limit: int = 50) -> dict:
    """Inspect the log template registry — useful for the demo and for
    understanding how much repetition the ingest stream has."""
    with _engine_lock:
        all_t = _engine.templates.all_templates()
    all_t.sort(key=lambda t: t["frequency"], reverse=True)
    return {
        "total": len(all_t),
        "shown": min(limit, len(all_t)),
        "templates": all_t[:limit],
    }


# ---------- WebSocket --------------------------------------------------------

@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    """Push the current graph + last context every 2s to keep the dashboard
    live-feeling. PCE has no tick loop, so this is just a periodic snapshot
    rather than a true event stream."""
    await websocket.accept()
    try:
        while True:
            with _engine_lock:
                payload = {
                    "type": "update",
                    "graph": projection.project_graph(_engine),
                    "prediction": projection.project_prediction_from_context(
                        _last_context, _last_signal.get("incident_id") if _last_signal else None
                    ) or {},
                    "action_plan": _last_action_plan,
                    "dry_run": True,
                }
            await websocket.send_json(payload)
            await asyncio.sleep(2.0)
    except WebSocketDisconnect:
        return


@app.post("/api/pce/reset")
def reset() -> dict:
    """Wipe engine state — handy during demos to compare runs."""
    global _engine, _last_context, _last_action_plan, _last_signal
    with _engine_lock:
        _engine = Engine()
        _last_context = None
        _last_action_plan = None
        _last_signal = None
    return {"ok": True}
