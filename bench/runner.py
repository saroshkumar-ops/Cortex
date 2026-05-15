"""Bench runner — ingests a JSONL stream, fires reconstruct_context on every
incident_signal, emits a JSON report.

This is the harness our submission is judged through. Pure stdlib.

Usage:
    python -m bench.runner --input bench/samples/recurring_family.jsonl --out report.json
    python -m bench.runner --input bench/samples/worked_example.jsonl --mode fast
"""

import argparse
import json
import os
import sys
import time

# Allow `python bench/runner.py` from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pce.adapter import Engine


def load_jsonl(path: str) -> list[dict]:
    events: list[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            events.append(json.loads(line))
    return events


def run(input_path: str, mode: str = "fast", out_path: str | None = None) -> dict:
    events = load_jsonl(input_path)

    engine = Engine()

    # Ingest non-signal events first, then query signals in order. The bench
    # treats incident_signals as queries — but downstream remediations still
    # need to be ingested so the feedback loop and matcher registry fill in.
    signal_indices = [i for i, e in enumerate(events) if e.get("kind") == "incident_signal"]

    t0 = time.perf_counter()
    engine.ingest(events)
    ingest_ms = (time.perf_counter() - t0) * 1000

    reconstructions: list[dict] = []
    total_recon_ms = 0.0
    for sig_idx in signal_indices:
        signal = events[sig_idx]
        t = time.perf_counter()
        ctx = engine.reconstruct_context(signal, mode=mode)
        elapsed_ms = (time.perf_counter() - t) * 1000
        total_recon_ms += elapsed_ms
        reconstructions.append({
            "incident_id": signal.get("incident_id"),
            "trigger": signal.get("trigger"),
            "ts": signal.get("ts"),
            "elapsed_ms": round(elapsed_ms, 3),
            "context": ctx,
        })

    report = {
        "input": input_path,
        "mode": mode,
        "event_count": len(events),
        "signal_count": len(signal_indices),
        "ingest_ms": round(ingest_ms, 3),
        "reconstruct_total_ms": round(total_recon_ms, 3),
        "reconstruct_avg_ms": round(total_recon_ms / max(1, len(signal_indices)), 3),
        "reconstructions": reconstructions,
        "memory_stats": {
            "events_stored": len(engine.log),
            "incidents_registered": len(engine.matcher.all_incident_ids()),
            "resolved_incidents": len(engine._resolved),
            "rename_chains": len(engine.identity._successor),
        },
    }

    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

    return report


def _summarize(report: dict) -> None:
    print(f"Input:       {report['input']}")
    print(f"Mode:        {report['mode']}")
    print(f"Events:      {report['event_count']}")
    print(f"Signals:     {report['signal_count']}")
    print(f"Ingest ms:   {report['ingest_ms']:.2f}")
    print(f"Recon avg:   {report['reconstruct_avg_ms']:.2f} ms (p budget fast=2000, deep=6000)")
    print(f"Memory:      {report['memory_stats']}")
    print("-" * 60)
    for r in report["reconstructions"]:
        ctx = r["context"]
        print(f"\n  [{r['incident_id']}] @ {r['ts']}  ({r['elapsed_ms']:.2f} ms)")
        print(f"    trigger: {r['trigger']}")
        print(f"    confidence: {ctx['confidence']}")
        print(f"    related_events: {len(ctx['related_events'])}")
        print(f"    causal_chain edges: {len(ctx['causal_chain'])}")
        print(f"    similar_past_incidents: {len(ctx['similar_past_incidents'])}")
        for m in ctx["similar_past_incidents"][:3]:
            print(f"      - {m['past_incident_id']}  sim={m['similarity']}")
            print(f"        rationale: {m['rationale']}")
        print(f"    suggested_remediations: {len(ctx['suggested_remediations'])}")
        for s in ctx["suggested_remediations"][:2]:
            print(f"      - {s['action']} on {s['target']}  ({s['historical_outcome']}, conf={s['confidence']})")
        print(f"    explain: {ctx['explain']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="path to JSONL event stream")
    parser.add_argument("--mode", default="fast", choices=["fast", "deep"])
    parser.add_argument("--out", default=None, help="optional path to write JSON report")
    parser.add_argument("--quiet", action="store_true", help="suppress summary output")
    args = parser.parse_args()

    report = run(args.input, mode=args.mode, out_path=args.out)
    if not args.quiet:
        _summarize(report)
