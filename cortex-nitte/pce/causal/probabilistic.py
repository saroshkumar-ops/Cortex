"""Probabilistic causal edge scoring."""

from __future__ import annotations

from pce.store.event_log import _parse_ts


KIND_AFFINITY: dict[tuple[str, str], float] = {
    ("deploy", "metric"): 0.85,
    ("deploy", "log"): 0.70,
    ("deploy", "trace"): 0.55,
    ("deploy", "incident_signal"): 0.65,
    ("metric", "log"): 0.55,
    ("metric", "incident_signal"): 0.85,
    ("metric", "trace"): 0.45,
    ("log", "incident_signal"): 0.85,
    ("log", "log"): 0.45,
    ("trace", "log"): 0.55,
    ("trace", "incident_signal"): 0.50,
    ("topology", "metric"): 0.35,
    ("topology", "log"): 0.30,
    ("topology", "incident_signal"): 0.25,
}


def score_edge(engine, cause_id: int, effect_id: int) -> tuple[float, list[str]]:
    cause = engine.log.get(cause_id)
    effect = engine.log.get(effect_id)

    c_kind = cause.get("kind", "")
    e_kind = effect.get("kind", "")
    affinity = KIND_AFFINITY.get((c_kind, e_kind), 0.0)
    if affinity == 0.0:
        return 0.0, []

    dt = engine.log.ts_of(effect_id) - engine.log.ts_of(cause_id)
    temporal = _temporal_score(dt)
    if temporal == 0.0:
        return 0.0, []

    evidence = _evidence_strength(cause, effect)
    topology = _topology_score(engine, cause, effect)
    historical = engine.knowledge.edge_success_rate(c_kind, e_kind) if getattr(engine, "knowledge", None) else 0.0
    rel_weight = engine.relationships.edge_weight(c_kind, e_kind, engine.log.ts_of(effect_id)) if getattr(engine, "relationships", None) else 0.0

    score = (
        0.30 * affinity
        + 0.25 * temporal
        + 0.15 * historical
        + 0.15 * topology
        + 0.10 * evidence
        + 0.05 * max(-0.5, min(0.5, rel_weight))
    )
    score = max(0.0, min(1.0, score))

    reasons = [
        f"{c_kind}->{e_kind}",
        f"dt={dt:.1f}s",
    ]
    if topology > 0.0:
        reasons.append("topology")
    if historical > 0.0:
        reasons.append("history")
    if evidence > 0.6:
        reasons.append("evidence")
    return score, reasons


def _temporal_score(dt: float) -> float:
    if dt < 0:
        return 0.0
    if dt <= 1:
        return 0.85
    if dt <= 60:
        return 1.0
    if dt <= 180:
        return 0.75
    if dt <= 600:
        return 0.45
    return 0.15


def _evidence_strength(cause: dict, effect: dict) -> float:
    strength = 0.0
    c_kind = cause.get("kind")
    if c_kind == "deploy":
        strength += 0.6
    elif c_kind == "log":
        level = (cause.get("level") or "").lower()
        if level == "error":
            strength += 0.8
    elif c_kind == "metric":
        name = (cause.get("name") or "").lower()
        val = float(cause.get("value", 0.0) or 0.0)
        if "latency" in name and val > 1000:
            strength += 0.8
        elif "error_rate" in name and val > 0.05:
            strength += 0.7
        else:
            strength += 0.4
    elif c_kind == "topology":
        strength += 0.4

    e_kind = effect.get("kind")
    if e_kind == "incident_signal":
        strength += 0.2
    return min(1.0, strength)


def _topology_score(engine, cause: dict, effect: dict) -> float:
    c_svc = cause.get("service") or cause.get("target")
    e_svc = effect.get("service") or effect.get("target")
    if not c_svc or not e_svc:
        return 0.0
    c_id = engine.identity.canonical_id(c_svc, cause.get("ts"))
    e_id = engine.identity.canonical_id(e_svc, effect.get("ts"))
    if c_id is None or e_id is None:
        return 0.0
    if c_id == e_id:
        return 0.25
    neighbors = engine.identity.neighbors(c_id)
    return 0.15 if e_id in neighbors else 0.0
