"""Smoke tests for the Person A storage substrate.

Run from repo root: python -m tests.test_storage
Or:                 python tests/test_storage.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pce.adapter import Engine


WORKED_EXAMPLE = [
    {"ts": "2026-05-10T14:21:30Z", "kind": "deploy",   "service": "payments-svc", "version": "v2.14.0", "actor": "ci"},
    {"ts": "2026-05-10T14:22:01Z", "kind": "log",      "service": "checkout-api", "level": "error", "msg": "timeout calling payments-svc", "trace_id": "abc123"},
    {"ts": "2026-05-10T14:22:01Z", "kind": "metric",   "service": "payments-svc", "name": "latency_p99_ms", "value": 4820},
    {"ts": "2026-05-10T14:22:08Z", "kind": "trace",    "trace_id": "abc123", "spans": [{"svc": "checkout-api", "dur_ms": 5012}, {"svc": "payments-svc", "dur_ms": 4980}]},
    {"ts": "2026-05-10T14:30:00Z", "kind": "topology", "change": "rename", "from": "payments-svc", "to": "billing-svc"},
    {"ts": "2026-05-10T14:32:11Z", "kind": "incident_signal", "incident_id": "INC-714", "trigger": "alert:checkout-api/error-rate>5%"},
    {"ts": "2026-05-10T15:10:00Z", "kind": "remediation", "incident_id": "INC-714", "action": "rollback", "target": "billing-svc", "version": "v2.13.4", "outcome": "resolved"},
]


def test_basic_ingest():
    eng = Engine()
    eng.ingest(WORKED_EXAMPLE)
    assert len(eng.log) == 7, f"expected 7 events, got {len(eng.log)}"
    assert eng.log.get(0)["event_id"] == 0
    print("  ✓ basic ingest: 7 events stored with monotonic ids")


def test_rename_resolution():
    eng = Engine()
    eng.ingest(WORKED_EXAMPLE)
    # Before rename, payments-svc is its own canonical
    # After rename, both names resolve to billing-svc
    assert eng.identity.canonical("payments-svc") == "billing-svc", (
        f"expected 'billing-svc', got {eng.identity.canonical('payments-svc')!r}"
    )
    assert eng.identity.canonical("billing-svc") == "billing-svc"
    print("  ✓ rename resolution: payments-svc -> billing-svc")


def test_transitive_rename():
    eng = Engine()
    eng.ingest([
        {"ts": "2026-01-01T00:00:00Z", "kind": "topology", "change": "rename", "from": "A", "to": "B"},
        {"ts": "2026-02-01T00:00:00Z", "kind": "topology", "change": "rename", "from": "B", "to": "C"},
        {"ts": "2026-03-01T00:00:00Z", "kind": "topology", "change": "rename", "from": "C", "to": "D"},
    ])
    assert eng.identity.canonical("A") == "D", f"expected 'D', got {eng.identity.canonical('A')!r}"
    assert eng.identity.canonical("B") == "D"
    assert eng.identity.canonical("C") == "D"
    print("  ✓ transitive rename A→B→C→D resolves to D")


def test_point_in_time_canonical():
    eng = Engine()
    eng.ingest([
        {"ts": "2026-01-01T00:00:00Z", "kind": "topology", "change": "rename", "from": "A", "to": "B"},
        {"ts": "2026-02-01T00:00:00Z", "kind": "topology", "change": "rename", "from": "B", "to": "C"},
    ])
    # As of mid-January, A had become B but B had not yet become C.
    assert eng.identity.canonical("A", "2026-01-15T00:00:00Z") == "B"
    # As of mid-February, A→B→C is complete.
    assert eng.identity.canonical("A", "2026-02-15T00:00:00Z") == "C"
    print("  ✓ point-in-time canonical resolution honors rename timestamps")


def test_indices():
    eng = Engine()
    eng.ingest(WORKED_EXAMPLE)
    # All payments-svc and billing-svc references should land under the canonical 'billing-svc'.
    # The deploy, metric, and remediation events name a payments-/billing- service.
    # The trace event has a span for payments-svc as well.
    billing_ids = eng.indices.ids_for_service("billing-svc")
    assert len(billing_ids) >= 3, f"expected ≥3 billing-svc events, got {len(billing_ids)}: {billing_ids}"

    # Trace index
    trace_ids = eng.indices.ids_for_trace("abc123")
    assert len(trace_ids) == 2, f"expected 2 abc123 trace events (log + trace), got {len(trace_ids)}"

    # Incident index
    inc_ids = eng.indices.ids_for_incident("INC-714")
    assert len(inc_ids) == 2, f"expected 2 INC-714 events (signal + remediation), got {len(inc_ids)}"

    # Kind index
    assert len(eng.indices.ids_for_kind("deploy")) == 1
    assert len(eng.indices.ids_for_kind("remediation")) == 1
    print("  ✓ indices: service/trace/incident/kind all populated correctly")


def test_time_window():
    eng = Engine()
    eng.ingest(WORKED_EXAMPLE)
    # Window around the first error log/metric (14:22:01 UTC)
    from pce.store.event_log import _parse_ts
    t = _parse_ts("2026-05-10T14:22:01Z")
    ids = eng.indices.ids_in_window(t - 60, t + 60)
    # Should capture deploy(14:21:30), log(14:22:01), metric(14:22:01), trace(14:22:08)
    assert len(ids) >= 4, f"expected ≥4 events in 2-minute window, got {len(ids)}: {ids}"
    print(f"  ✓ time window query: {len(ids)} events around incident time")


def test_stub_reconstruct():
    eng = Engine()
    eng.ingest(WORKED_EXAMPLE)
    ctx = eng.reconstruct_context(WORKED_EXAMPLE[5], mode="fast")
    # Stub returns empty-but-valid context — Persons B + C will fill it in.
    assert set(ctx.keys()) == {
        "related_events", "causal_chain", "similar_past_incidents",
        "suggested_remediations", "confidence", "explain",
    }
    print("  ✓ reconstruct_context returns valid Context shape (stub)")


if __name__ == "__main__":
    print("Person A — storage substrate smoke tests")
    print("-" * 50)
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    print("-" * 50)
    print("All Person A tests passed.")
