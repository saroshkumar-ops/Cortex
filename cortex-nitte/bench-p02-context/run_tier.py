"""Per-tier runners callable from the demo UI.

L1 — Canonical worked example (deterministic; pass/fail).
L2 — Property-based multi-seed at standard scale (12 svc × 7 days).
L3 — Council's official `run.py` at L3 stretch (30 svc × 21 days, decoys).

Each writes a per-tier JSON to bench-p02-context/. Only l3_report.json is
the council-submission artifact; L1 and L2 reports are for the demo video
and internal validation.
"""

from __future__ import annotations

import importlib
import json
import os
import random
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
if HERE not in sys.path:
    sys.path.insert(0, HERE)


def _adapter_factory(spec: str):
    mod, cls = spec.split(":")
    cls_obj = getattr(importlib.import_module(mod), cls)
    return lambda: cls_obj()


# ---------- L1 ---------------------------------------------------------------

def run_l1() -> dict[str, Any]:
    sample = os.path.join(REPO_ROOT, "bench", "samples", "worked_example.jsonl")
    out = os.path.join(HERE, "l1_report.json")
    t0 = time.monotonic()
    cmd = [
        sys.executable, "-m", "bench.runner",
        "--input", sample,
        "--out", out, "--mode", "fast",
    ]
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    elapsed_ms = round((time.monotonic() - t0) * 1000.0, 1)
    raw: dict = {}
    if os.path.isfile(out):
        with open(out, "r", encoding="utf-8") as f:
            raw = json.load(f)
    recon = raw.get("reconstructions", [])
    n = len(recon)
    n_with_matches = sum(1 for r in recon if r.get("context", {}).get("similar_past_incidents"))
    n_with_remediations = sum(1 for r in recon if r.get("context", {}).get("suggested_remediations"))
    summary = {
        "tier": "L1",
        "kind": "canonical",
        "scenario": "worked_example",
        "passed": proc.returncode == 0 and n > 0,
        "signals_scored": n,
        "signals_with_matches": n_with_matches,
        "signals_with_remediations": n_with_remediations,
        "reconstruct_avg_ms": raw.get("reconstruct_avg_ms"),
        "memory_stats": raw.get("memory_stats"),
        "report_path": "bench-p02-context/l1_report.json",
        "elapsed_ms": elapsed_ms,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    # Re-write l1_report.json as the *summary* the UI consumes (also keeps the
    # raw runner report under a nested key for inspection).
    summary["raw"] = raw
    with open(out, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    return summary


# ---------- L2 ---------------------------------------------------------------

def run_l2(adapter: str = "adapters.cortex:Engine",
           seeds: list[int] | None = None) -> dict[str, Any]:
    from generator import GenConfig
    from harness import run as harness_run

    seeds = seeds or [random.randint(1000, 1_000_000) for _ in range(5)]
    factory = _adapter_factory(adapter)
    cfg = GenConfig(n_services=12, days=7)
    t0 = time.monotonic()
    out = harness_run(factory, cfg, mode="fast", seeds=seeds, warmup=2)
    elapsed_ms = round((time.monotonic() - t0) * 1000.0, 1)
    summary = {
        "tier": "L2",
        "kind": "property_based",
        "config": {"n_services": 12, "days": 7, "mode": "fast"},
        "seeds": seeds,
        "per_seed_summary": [
            {"seed": p["seed"], **p["summary"]} for p in out.get("per_seed", [])
        ],
        "aggregated": out.get("aggregated"),
        "score": out.get("score"),
        "report_path": "bench-p02-context/l2_report.json",
        "elapsed_ms": elapsed_ms,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    out_path = os.path.join(HERE, "l2_report.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    return summary


# ---------- L3 ---------------------------------------------------------------

def run_l3(adapter: str = "adapters.cortex:Engine") -> dict[str, Any]:
    """Invoke the council's official run.py. Captures the banner so the demo
    video can show it. The on-disk artifact is bench-p02-context/l3_report.json,
    which is what gets submitted."""
    t0 = time.monotonic()
    proc = subprocess.run(
        [sys.executable, "-u", "run.py",
         "--adapter", adapter, "--out", "l3_report.json"],
        cwd=HERE, capture_output=True, text=True,
    )
    elapsed_ms = round((time.monotonic() - t0) * 1000.0, 1)
    out_path = os.path.join(HERE, "l3_report.json")
    if not os.path.isfile(out_path):
        return {
            "tier": "L3", "kind": "official_l3",
            "ok": False,
            "stderr_tail": (proc.stderr or "")[-500:],
            "elapsed_ms": elapsed_ms,
        }
    with open(out_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    summary = {
        "tier": "L3",
        "kind": "official_l3",
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
        "stderr_tail": (proc.stderr or "")[-2000:],  # contains the banner
        "report_path": "bench-p02-context/l3_report.json",
        "elapsed_ms": elapsed_ms,
        "ok": True,
    }
    return summary
