"""Remediation history — action -> outcome aggregation per past incident.

For each past incident, surface the remediation(s) that resolved it. When a
query matches K past incidents, aggregate their remediations by canonical
action so we can recommend the historically-successful one.
"""

from pce.schema import Remediation


_RESOLVED_OUTCOMES = {"resolved", "success", "fixed", "ok"}


def remediations_for_incident(engine, incident_id: str) -> list[dict]:
    """Return the raw remediation event dicts for a given incident_id."""
    ids = engine.indices.ids_for_incident(incident_id)
    out: list[dict] = []
    for eid in ids:
        ev = engine.log.get(eid)
        if ev.get("kind") == "remediation":
            out.append(ev)
    return out


def aggregate_from_matches(
    engine,
    matches: list[tuple[str, float, set[str]]],
    signal_canonical_service: str | None,
    top_n: int = 3,
) -> list[Remediation]:
    """Resolves a past remediation's target to its current canonical name —
    so a historical `target: payments-svc` becomes `target: billing-svc` after
    the rename."""
    """Aggregate remediations across matched past incidents.

    Each entry is keyed by `action` and carries:
      - target  : signal's canonical service (we recommend acting on the
                  current incident's service, even if past incident's
                  target had a different historical name)
      - historical_outcome : "resolved {k}/{n}" string
      - confidence : weighted by similarity * success_rate
    """
    if not matches:
        return []

    # action -> {successes, total, similarity_weighted_score, sample_target}
    bucket: dict[str, dict] = {}

    for past_id, similarity, _overlap in matches:
        for rem in remediations_for_incident(engine, past_id):
            action = rem.get("action") or "unknown"
            outcome = (rem.get("outcome") or "").lower()
            resolved = outcome in _RESOLVED_OUTCOMES
            entry = bucket.setdefault(action, {
                "successes": 0,
                "total": 0,
                "score": 0.0,
                "sample_target": None,
            })
            entry["total"] += 1
            if resolved:
                entry["successes"] += 1
                entry["score"] += similarity  # only successes contribute weight
            # Resolve the past target through the rename graph so we end up
            # with the *current* canonical name even if the service was
            # subsequently renamed.
            if entry["sample_target"] is None:
                raw_target = rem.get("target")
                # Resolve to the *latest* canonical name (at_ts=None) so
                # post-rename queries get the current service name in the
                # recommendation, not the pre-rename historical one.
                entry["sample_target"] = engine.identity.canonical(raw_target, None) if raw_target else None

    if not bucket:
        return []

    out: list[Remediation] = []
    for action, entry in bucket.items():
        total = entry["total"]
        successes = entry["successes"]
        # Final confidence: success_rate * normalized similarity weight, capped.
        success_rate = successes / total if total else 0.0
        norm_score = entry["score"] / max(len(matches), 1)
        conf = success_rate * 0.7 + norm_score * 0.3
        conf = max(0.0, min(1.0, conf))

        # Prefer the historical remediation's target (resolved to current
        # canonical name) — the signal's service is often the *symptom*
        # service (e.g. checkout-api) while the remediation goes on the
        # *cause* service (e.g. billing-svc after rename).
        target = entry["sample_target"] or signal_canonical_service or "unknown"
        out.append({
            "action": action,
            "target": target,
            "historical_outcome": f"resolved {successes}/{total}",
            "confidence": round(conf, 4),
        })

    out.sort(key=lambda r: r["confidence"], reverse=True)
    return out[:top_n]


def fallback_heuristic(engine, window_ids: list[int], signal_canonical_service: str | None) -> list[Remediation]:
    """When no past matches exist, suggest from observed event patterns.

    Plain heuristics — used only as a floor so the Context is never empty
    for first-of-its-kind incidents.
    """
    has_recent_deploy = False
    has_high_latency = False
    has_error_burst = False
    target = signal_canonical_service or "unknown"

    for eid in window_ids:
        ev = engine.log.get(eid)
        kind = ev.get("kind")
        if kind == "deploy":
            has_recent_deploy = True
        elif kind == "metric":
            name = (ev.get("name") or "").lower()
            val = float(ev.get("value", 0.0) or 0.0)
            if "latency" in name and val > 1000:
                has_high_latency = True
        elif kind == "log" and (ev.get("level") or "").lower() == "error":
            has_error_burst = True

    out: list[Remediation] = []
    if has_recent_deploy and (has_high_latency or has_error_burst):
        out.append({
            "action": "rollback",
            "target": target,
            "historical_outcome": "heuristic: recent deploy + degradation",
            "confidence": 0.40,
        })
    if has_high_latency:
        out.append({
            "action": "scale_up",
            "target": target,
            "historical_outcome": "heuristic: sustained latency breach",
            "confidence": 0.35,
        })
    if not out:
        out.append({
            "action": "alert",
            "target": target,
            "historical_outcome": "heuristic: no historical match",
            "confidence": 0.20,
        })
    return out
