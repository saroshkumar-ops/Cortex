"""Three benchmark endpoints — one per tier.

L1, L2 produce internal validation reports. Only L3 produces the
council-submission artifact (`l3_report.json`).
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter()

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BENCH_DIR = os.path.join(REPO_ROOT, "bench-p02-context")

if BENCH_DIR not in sys.path:
    sys.path.insert(0, BENCH_DIR)


def _import_runner():
    import importlib
    if "run_tier" in sys.modules:
        return importlib.reload(sys.modules["run_tier"])
    return importlib.import_module("run_tier")


@router.post("/api/bench/l1")
def bench_l1() -> dict[str, Any]:
    return _import_runner().run_l1()


@router.post("/api/bench/l2")
def bench_l2(body: dict = {}) -> dict[str, Any]:
    seeds = body.get("seeds") if isinstance(body, dict) else None
    return _import_runner().run_l2(seeds=seeds)


@router.post("/api/bench/l3")
def bench_l3() -> dict[str, Any]:
    return _import_runner().run_l3()


# Read-only access to the on-disk artifacts (so the page can preload prior runs).

def _read_json(path: str) -> dict | None:
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _l3_summary_from_raw(raw: dict) -> dict:
    """Adapt the raw council-bench report into the summary shape the UI uses."""
    return {
        "tier": "L3",
        "kind": "official_l3",
        "ok": True,
        "l3_version": raw.get("l3_version"),
        "timestamp": raw.get("timestamp"),
        "adapter": raw.get("adapter"),
        "adapter_sha256": (raw.get("adapter_sha256") or "")[:16] + "…",
        "seeds": raw.get("seeds"),
        "mode": raw.get("mode"),
        "score": raw.get("score"),
        "aggregated": raw.get("aggregated"),
        "per_seed_summary": [
            {"seed": p["seed"], **p["summary"]} for p in raw.get("per_seed", [])
        ],
        "report_path": "bench-p02-context/l3_report.json",
        "elapsed_ms": 0,
    }


@router.get("/api/bench/report/{tier}")
def get_tier_report(tier: str) -> dict:
    fname = {
        "l1": "l1_report.json",
        "l2": "l2_report.json",
        "l3": "l3_report.json",
    }.get(tier.lower())
    if not fname:
        raise HTTPException(404, f"unknown tier '{tier}'")
    path = os.path.join(BENCH_DIR, fname)
    data = _read_json(path)
    if data is None:
        raise HTTPException(404, f"no report yet for {tier}")
    # If the on-disk L3 file is the council's raw report (no `ok` flag), wrap it.
    if tier.lower() == "l3" and "ok" not in data and "l3_version" in data:
        data = _l3_summary_from_raw(data)
    return data
