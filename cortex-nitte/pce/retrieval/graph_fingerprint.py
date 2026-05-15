"""Graph fingerprinting for incident patterns (WL-style hashing)."""

from __future__ import annotations

from collections import defaultdict
import hashlib


_LATENCY_HIGH_MS = 1000.0


def build_graph_tokens(engine, window_ids, signal_event_id, chain=None, iterations: int = 2) -> set[str]:
    if not window_ids:
        return set()

    signal_evt = engine.log.get(signal_event_id)
    signal_svc_id = engine.identity.canonical_id(
        signal_evt.get("service") or signal_evt.get("target"),
        signal_evt.get("ts"),
    )

    nodes: dict[int, str] = {}
    edges: dict[int, set[int]] = defaultdict(set)

    for eid in window_ids:
        ev = engine.log.get(eid)
        nodes[eid] = _label_event(engine, ev, signal_svc_id)

    if chain:
        for edge in chain:
            try:
                c_id = int(edge["cause_event_id"])
                e_id = int(edge["effect_event_id"])
            except (KeyError, ValueError, TypeError):
                continue
            if c_id in nodes and e_id in nodes:
                edges[c_id].add(e_id)
                edges[e_id].add(c_id)
    else:
        ordered = sorted(window_ids, key=engine.log.ts_of)
        for prev_id, next_id in zip(ordered, ordered[1:]):
            edges[prev_id].add(next_id)
            edges[next_id].add(prev_id)

    labels = {eid: _hash_label(nodes[eid], b"pce-wl0") for eid in nodes}
    tokens: set[str] = {f"wl0:{lbl}" for lbl in labels.values()}

    for i in range(1, iterations + 1):
        new_labels = {}
        salt = f"pce-wl{i}".encode("utf-8")
        for eid in nodes:
            neigh = sorted(labels[n] for n in edges.get(eid, set()))
            merged = labels[eid] + "|" + ",".join(neigh)
            new_labels[eid] = _hash_label(merged, salt)
        tokens.update({f"wl{i}:{lbl}" for lbl in new_labels.values()})
        labels = new_labels

    return tokens


def _label_event(engine, event: dict, signal_svc_id: int | None) -> str:
    kind = event.get("kind", "event")
    role = _role(engine, event, signal_svc_id)

    if kind == "log":
        level = (event.get("level") or "").lower()
        kind = "log_error" if level == "error" else "log"
    elif kind == "metric":
        name = (event.get("name") or "").lower()
        val = float(event.get("value", 0.0) or 0.0)
        if "latency" in name and val >= _LATENCY_HIGH_MS:
            kind = "metric_latency_high"
        else:
            kind = "metric"
    elif kind == "trace":
        spans = event.get("spans") or []
        kind = "trace_fanout" if len(spans) >= 3 else "trace"

    return f"{kind}:{role}"


def _role(engine, event: dict, signal_svc_id: int | None) -> str:
    svc = event.get("service") or event.get("target")
    if not svc or signal_svc_id is None:
        return "unknown"
    sid = engine.identity.canonical_id(svc, event.get("ts"))
    if sid is None:
        return "unknown"
    return "self" if sid == signal_svc_id else "peer"


def _hash_label(label: str, salt: bytes) -> str:
    h = hashlib.blake2b(label.encode("utf-8"), digest_size=6, person=salt)
    return h.hexdigest()
