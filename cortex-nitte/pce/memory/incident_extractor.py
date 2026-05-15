"""Incident abstraction and feature extraction."""

from __future__ import annotations

from typing import Iterable

from pce.causal.chain import build_chain
from pce.causal.window import get_window, FAST_BEFORE_S, FAST_AFTER_S
from pce.schemas.incident import IncidentEpisode, IncidentSignature
from pce.signature import abstraction, shape
from pce.retrieval.graph_fingerprint import build_graph_tokens


_LATENCY_HIGH_MS = 1000.0
_ERROR_RATE_HIGH = 0.05


def extract_episode(
    engine,
    incident_id: str,
    signal_event_id: int | None = None,
    window_ids: list[int] | None = None,
    mode: str = "fast",
) -> IncidentEpisode | None:
    if not incident_id:
        return None

    if signal_event_id is None:
        ids = engine.indices.ids_for_incident(incident_id)
        if not ids:
            return None
        signal_event_id = ids[0]

    signal_event = engine.log.get(signal_event_id)
    signal_ts = engine.log.ts_of(signal_event_id)

    if window_ids is None:
        window_ids, _ = get_window(engine, signal_event_id, mode=mode)

    canonical_service_id = _canonical_id(engine, signal_event)
    canonical_service_name = _canonical_name(engine, signal_event)

    trigger_type = _trigger_type(signal_event.get("trigger") or "")
    symptom_types = _symptom_types(engine, signal_event_id, window_ids)
    temporal_buckets = _temporal_buckets(engine, signal_event_id, window_ids)

    involved_service_ids = _involved_service_ids(engine, window_ids)
    involved_clusters = engine.identity.cluster_signatures(involved_service_ids)

    remediation_actions, remediation_outcomes = _remediation_history(engine, incident_id)

    # Keep behavior tokens aligned with the LSH index (fast window), while
    # deep mode expands other structural features separately.
    before_s, after_s = FAST_BEFORE_S, FAST_AFTER_S

    behavior_tokens, _meta = abstraction.build_tokens(
        engine,
        incident_id,
        window_ids=window_ids,
        signal_event_id=signal_event_id,
        window_before_s=before_s,
        window_after_s=after_s,
    )
    behavior_tokens_set = set(behavior_tokens)
    minhash_sig = shape.minhash(behavior_tokens_set)

    chain = build_chain(engine, signal_event_id, window_ids, mode=mode)
    causal_pattern = _causal_pattern(engine, chain)

    graph_tokens = build_graph_tokens(
        engine,
        window_ids,
        signal_event_id,
        chain=chain,
    )

    signature = IncidentSignature(
        trigger_type=trigger_type,
        symptom_types=frozenset(symptom_types),
        causal_pattern=tuple(causal_pattern),
        involved_service_ids=frozenset(involved_service_ids),
        involved_service_clusters=frozenset(involved_clusters),
        remediation_actions=tuple(remediation_actions),
        remediation_outcomes=tuple(remediation_outcomes),
        temporal_buckets=frozenset(temporal_buckets),
        graph_tokens=frozenset(graph_tokens),
        behavior_tokens=frozenset(behavior_tokens_set),
        minhash_signature=minhash_sig,
    )

    return IncidentEpisode(
        incident_id=incident_id,
        signal_event_id=signal_event_id,
        signal_ts=signal_ts,
        canonical_service_id=canonical_service_id,
        canonical_service_name=canonical_service_name,
        window_event_ids=list(window_ids),
        signature=signature,
        causal_chain=chain,
    )


# ---- helpers ----


def _trigger_type(trigger: str) -> str:
    t = (trigger or "").lower()
    if "latency" in t:
        return "latency_alert"
    if "error" in t or "timeout" in t:
        return "error_alert"
    if "saturation" in t or "cpu" in t or "memory" in t:
        return "resource_alert"
    return "generic_alert"


def _symptom_types(engine, signal_event_id: int, window_ids: Iterable[int]) -> set[str]:
    out: set[str] = set()
    signal_ts = engine.log.ts_of(signal_event_id)
    for eid in window_ids:
        if eid == signal_event_id:
            continue
        ev = engine.log.get(eid)
        kind = ev.get("kind")
        if kind == "deploy":
            out.add("recent_deploy")
        elif kind == "metric":
            name = (ev.get("name") or "").lower()
            val = float(ev.get("value", 0.0) or 0.0)
            if "latency" in name and val >= _LATENCY_HIGH_MS:
                out.add("latency_spike")
            elif "error_rate" in name and val >= _ERROR_RATE_HIGH:
                out.add("error_rate_spike")
            else:
                out.add("metric_anomaly")
        elif kind == "log":
            level = (ev.get("level") or "").lower()
            msg = (ev.get("msg") or "").lower()
            if level == "error":
                out.add("error_log")
            if "timeout" in msg:
                out.add("timeout")
        elif kind == "trace":
            spans = ev.get("spans") or []
            if len(spans) >= 3:
                out.add("trace_fanout")
        elif kind == "topology":
            out.add("topology_change")
        elif kind == "remediation":
            out.add("prior_remediation")

    if not out:
        out.add("unspecified")
    return out


def _temporal_buckets(engine, signal_event_id: int, window_ids: Iterable[int]) -> set[str]:
    out: set[str] = set()
    signal_ts = engine.log.ts_of(signal_event_id)
    for eid in window_ids:
        if eid == signal_event_id:
            continue
        ev = engine.log.get(eid)
        kind = ev.get("kind", "event")
        dt = engine.log.ts_of(eid) - signal_ts
        bucket = _bucket(dt)
        if bucket:
            out.add(f"{kind}:{bucket}")
    return out


def _bucket(dt: float) -> str | None:
    if dt > 120:
        return None
    if dt >= 0:
        return "post"
    abs_dt = -dt
    if abs_dt <= 60:
        return "0-60s"
    if abs_dt <= 300:
        return "1-5m"
    if abs_dt <= 900:
        return "5-15m"
    return "15m+"


def _involved_service_ids(engine, window_ids: Iterable[int]) -> set[int]:
    out: set[int] = set()
    for eid in window_ids:
        ev = engine.log.get(eid)
        svc = ev.get("service") or ev.get("target")
        if svc:
            sid = engine.identity.canonical_id(svc, ev.get("ts"))
            if sid is not None:
                out.add(sid)
        if ev.get("kind") == "trace":
            for sp in ev.get("spans") or []:
                sp_svc = sp.get("svc")
                if sp_svc:
                    sid = engine.identity.canonical_id(sp_svc, ev.get("ts"))
                    if sid is not None:
                        out.add(sid)
    return out


def _remediation_history(engine, incident_id: str) -> tuple[list[str], list[str]]:
    actions: list[str] = []
    outcomes: list[str] = []
    for eid in engine.indices.ids_for_incident(incident_id):
        ev = engine.log.get(eid)
        if ev.get("kind") != "remediation":
            continue
        action = ev.get("action")
        if action:
            actions.append(action)
        outcome = ev.get("outcome")
        if outcome:
            outcomes.append(outcome)
    return actions, outcomes


def _causal_pattern(engine, chain: list[dict]) -> list[str]:
    out: list[str] = []
    for edge in chain:
        try:
            cause = engine.log.get(int(edge["cause_event_id"]))
            effect = engine.log.get(int(edge["effect_event_id"]))
        except (KeyError, ValueError, TypeError):
            continue
        c_kind = cause.get("kind", "event")
        e_kind = effect.get("kind", "event")
        out.append(f"{c_kind}->{e_kind}")
    return out


def _canonical_id(engine, event: dict) -> int | None:
    svc = event.get("service") or event.get("target")
    return engine.identity.canonical_id(svc, event.get("ts")) if svc else None


def _canonical_name(engine, event: dict) -> str | None:
    svc = event.get("service") or event.get("target")
    return engine.identity.canonical(svc, None) if svc else None
