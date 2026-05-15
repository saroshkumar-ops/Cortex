"""Translate PCE engine state into the shapes the existing Cortex frontend expects.

The UI was originally built for a predictive SRE engine (GraphState with
health, Prediction with failure_prob/cascade_path, ActionPlan with severity).
We preserve those shapes so the dashboard renders without rewriting pages,
but populate them from PCE memory rather than live Prometheus.

Mapping summary:
  GraphState.nodes  <- canonical services observed in events
       .health     <- 1 - normalized error rate from latest metric events
       .metrics    <- latest metric values per service
  GraphState.edges <- inferred from trace spans + cross-service error logs
  Prediction       <- last reconstructed context (confidence -> failure_prob,
                      causal_chain final effect -> cascade_path)
  ActionPlan       <- suggested_remediations rendered as severity + action list
  ActionRecord     <- past remediation events from the log
"""

import time
from typing import Any
from pce.schema import Context


def _coalesced_services(engine) -> list[str]:
    """Distinct canonical-now service names. The by_service index is built
    point-in-time, so a renamed service has its pre-rename events under the
    old name. We collapse all aliases to their current canonical form for
    display."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in engine.indices.by_service.keys():
        canonical = engine.identity.canonical(raw) or raw
        if canonical not in seen:
            seen.add(canonical)
            out.append(canonical)
    return sorted(out)


def _ids_for_canonical(engine, canonical: str) -> list[int]:
    """Union of event ids across every historical alias of `canonical`."""
    aliases = engine.identity.aliases(canonical)
    if not aliases:
        aliases = {canonical}
    ids: list[int] = []
    for alias in aliases:
        ids.extend(engine.indices.ids_for_service(alias))
    return ids


def _latest_metric_for(engine, canonical_service: str, metric_family: str) -> float:
    """Latest matching metric value for a canonical service, or 0.0."""
    ids = _ids_for_canonical(engine, canonical_service)
    latest_ts = -1.0
    latest_val = 0.0
    for eid in ids:
        ev = engine.log.get(eid)
        if ev.get("kind") != "metric":
            continue
        if metric_family not in (ev.get("name") or "").lower():
            continue
        ts = engine.log.ts_of(eid)
        if ts > latest_ts:
            latest_ts = ts
            try:
                latest_val = float(ev.get("value", 0.0) or 0.0)
            except (TypeError, ValueError):
                latest_val = 0.0
    return latest_val


def _health_for(engine, canonical_service: str) -> tuple[float, str]:
    err = _latest_metric_for(engine, canonical_service, "error_rate")
    lat = _latest_metric_for(engine, canonical_service, "latency")
    err_n = min(1.0, err)
    lat_n = min(1.0, lat / 5000.0)  # 5s p99 == fully degraded
    health = 1.0 - (err_n * 0.6 + lat_n * 0.4)
    health = max(0.0, min(1.0, health))
    status = "healthy" if health >= 0.8 else ("degraded" if health >= 0.5 else "critical")
    return round(health, 3), status


def _history_for(engine, canonical_service: str, metric_family: str, n: int = 30) -> list[float]:
    ids = _ids_for_canonical(engine, canonical_service)
    pairs: list[tuple[float, float]] = []
    for eid in ids:
        ev = engine.log.get(eid)
        if ev.get("kind") != "metric":
            continue
        if metric_family not in (ev.get("name") or "").lower():
            continue
        try:
            pairs.append((engine.log.ts_of(eid), float(ev.get("value", 0.0) or 0.0)))
        except (TypeError, ValueError):
            pass
    pairs.sort()
    return [v for _, v in pairs[-n:]]


def project_graph(engine) -> dict:
    """Build a GraphState dict from engine memory."""
    services = _coalesced_services(engine)

    nodes: list[dict] = []
    for svc in services:
        health, status = _health_for(engine, svc)
        latency_p99 = _latest_metric_for(engine, svc, "latency")
        error_rate = _latest_metric_for(engine, svc, "error_rate")
        request_rate = _latest_metric_for(engine, svc, "request_rate")
        cpu = _latest_metric_for(engine, svc, "cpu")
        mem = _latest_metric_for(engine, svc, "memory")
        nodes.append({
            "id": svc,
            "label": svc,
            "status": status,
            "health": health,
            "metrics": {
                "latency_p50": round(latency_p99 * 0.5, 1),  # approximate
                "latency_p99": round(latency_p99, 1),
                "error_rate": round(error_rate, 4),
                "request_rate": round(request_rate, 2),
                "cpu_percent": round(cpu, 1),
                "memory_percent": round(mem, 1),
            },
            "history": {
                "latency_p99": _history_for(engine, svc, "latency"),
                "error_rate": _history_for(engine, svc, "error_rate"),
            },
        })

    # Edges inferred from trace spans (pairs of services co-occurring in a trace)
    # and from cross-service log mentions ("timeout calling X" on Y -> Y->X edge).
    edges_seen: dict[tuple[str, str], dict] = {}
    for eid in engine.log.all_ids():
        ev = engine.log.get(eid)
        kind = ev.get("kind")
        if kind == "trace":
            spans = ev.get("spans") or []
            for i in range(len(spans) - 1):
                # Resolve to *latest* canonical for the projected graph so
                # pre- and post-rename traces collapse onto the same edge.
                a = engine.identity.canonical(spans[i].get("svc"), None)
                b = engine.identity.canonical(spans[i + 1].get("svc"), None)
                if not a or not b or a == b:
                    continue
                key = (a, b)
                entry = edges_seen.setdefault(key, {"call_volume": 0, "errors": 0, "latency_sum": 0.0, "latency_n": 0})
                entry["call_volume"] += 1
                try:
                    entry["latency_sum"] += float(spans[i + 1].get("dur_ms", 0) or 0)
                    entry["latency_n"] += 1
                except (TypeError, ValueError):
                    pass
        elif kind == "log" and (ev.get("level") or "").lower() == "error":
            src_raw = ev.get("service")
            src = engine.identity.canonical(src_raw, None) if src_raw else None
            if not src:
                continue
            msg = ev.get("msg") or ""
            import re as _re
            for name in _re.findall(r"[a-z][a-z0-9\-]+(?:-svc|-api|-service)", msg):
                dst = engine.identity.canonical(name, None)
                if not dst or dst == src:
                    continue
                key = (src, dst)
                entry = edges_seen.setdefault(key, {"call_volume": 0, "errors": 0, "latency_sum": 0.0, "latency_n": 0})
                entry["errors"] += 1

    edges: list[dict] = []
    for (src, dst), stats in edges_seen.items():
        avg_lat = (stats["latency_sum"] / stats["latency_n"]) if stats["latency_n"] else 0.0
        err_rate = (stats["errors"] / max(stats["call_volume"], 1))
        edges.append({
            "id": f"{src}->{dst}",
            "source": src,
            "target": dst,
            "metrics": {
                "call_volume": stats["call_volume"],
                "error_rate": round(err_rate, 4),
                "latency": round(avg_lat, 1),
            },
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "tick_id": len(engine.log),
        "timestamp": time.time(),
    }


def project_prediction_from_context(ctx: Context | None, incident_id: str | None) -> dict | None:
    """Project the last reconstructed Context into the Prediction shape."""
    if ctx is None:
        return None
    # cascade_path = canonical services touched by the causal chain
    cascade_services: list[str] = []
    for edge in ctx.get("causal_chain", []):
        for eid_key in ("cause_id", "effect_id"):
            # Edge stores event ids; we can't resolve services here without engine.
            # Caller is expected to enrich with services. Leave list flat here.
            pass
    return {
        "failure_prob": round(ctx.get("confidence", 0.0), 4),
        "confidence": round(ctx.get("confidence", 0.0), 4),
        "time_to_failure_minutes": 0.0,  # not applicable in retrospective mode
        "cascade_path": cascade_services,
        "node_names": [],
        "incident_id": incident_id,
        "explain": ctx.get("explain", ""),
    }


def project_action_plan_from_context(engine, signal: dict, ctx: Context) -> dict:
    """Render suggested_remediations as an ActionPlan-shaped dict."""
    inc_id = signal.get("incident_id") or "ad-hoc"
    confidence = float(ctx.get("confidence", 0.0))
    if confidence >= 0.85:
        severity = "critical"
    elif confidence >= 0.65:
        severity = "high"
    elif confidence >= 0.40:
        severity = "medium"
    elif confidence > 0.0:
        severity = "low"
    else:
        severity = "none"

    actions: list[dict] = []
    for rem in ctx.get("suggested_remediations", []):
        actions.append({
            "type": rem["action"],
            "service": rem["target"],
            "reason": rem.get("historical_outcome", ""),
            "confidence": rem.get("confidence"),
        })

    # cascade_path from causal chain (canonical services)
    cascade: list[str] = []
    for edge in ctx.get("causal_chain", []):
        for eid_key in ("cause_id", "effect_id"):
            try:
                ev = engine.log.get(edge[eid_key])
            except (IndexError, KeyError):
                continue
            svc_raw = ev.get("service") or ev.get("target")
            if not svc_raw:
                continue
            svc = engine.identity.canonical(svc_raw, ev.get("ts"))
            if svc and svc not in cascade:
                cascade.append(svc)

    # Map signal back to a service for the ActionPlan
    from pce.signature.abstraction import extract_signal_service
    raw_svc = extract_signal_service(signal)
    canonical_svc = engine.identity.canonical(raw_svc, signal.get("ts")) if raw_svc else None

    return {
        "prediction_id": inc_id,
        "severity": severity,
        "service": canonical_svc or "unknown",
        "failure_prob": confidence,
        "time_to_failure_minutes": 0.0,
        "confidence": confidence,
        "cascade_path": cascade,
        "actions": actions,
        "reasoning": ctx.get("explain", ""),
        "tick_id": len(engine.log),
        "is_suppressed": False,
        "created_at": time.time(),
    }


def project_action_records(engine, limit: int = 100) -> list[dict]:
    """Past remediation events rendered as ActionRecord rows."""
    out: list[dict] = []
    for eid in engine.indices.ids_for_kind("remediation"):
        ev = engine.log.get(eid)
        target_raw = ev.get("target")
        target = engine.identity.canonical(target_raw, None) if target_raw else "unknown"
        out.append({
            "prediction_id": ev.get("incident_id") or "",
            "severity": "high",  # historical; severity not stored
            "service": target,
            "action_type": ev.get("action") or "unknown",
            "action": {"version": ev.get("version"), "target": target},
            "result": ev.get("outcome") or "unknown",
            "dry_run": False,
            "duration_ms": 0,
            "timestamp": engine.log.ts_of(eid),
        })
    out.sort(key=lambda r: r["timestamp"], reverse=True)
    return out[:limit]


def project_incidents(engine, limit: int = 100) -> list[dict]:
    """Past incident signals rendered as ActionPlan rows (one per known incident)."""
    out: list[dict] = []
    for inc_id in engine.matcher.all_incident_ids():
        # Lazily reconstruct each as a lightweight plan from stored signature meta.
        rec = engine.matcher.get(inc_id)
        if not rec:
            continue
        meta = rec.meta
        signal_event_id = meta.get("signal_event_id")
        if signal_event_id is None:
            continue
        signal = engine.log.get(signal_event_id)
        out.append({
            "prediction_id": inc_id,
            "severity": "medium",
            "service": meta.get("canonical_service") or "unknown",
            "failure_prob": 0.5,
            "time_to_failure_minutes": 0.0,
            "confidence": 0.5,
            "cascade_path": [],
            "actions": [],
            "reasoning": signal.get("trigger", ""),
            "tick_id": signal_event_id,
            "is_suppressed": False,
            "created_at": engine.log.ts_of(signal_event_id),
        })
    out.sort(key=lambda r: r["created_at"], reverse=True)
    return out[:limit]
