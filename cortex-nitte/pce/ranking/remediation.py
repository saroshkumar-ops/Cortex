"""Remediation ranking using matched incidents + knowledge stats."""

from __future__ import annotations

from pce.memory.remediation import remediations_for_incident


_RESOLVED_OUTCOMES = {"resolved", "success", "fixed", "ok"}


def rank_remediations(engine, matches, query_episode, top_n: int = 3) -> list[dict]:
    if not matches:
        return []

    query_ts = query_episode.signal_ts if query_episode else 0.0
    query_service_id = query_episode.canonical_service_id if query_episode else None
    query_service_name = query_episode.canonical_service_name if query_episode else None

    bucket: dict[str, dict] = {}

    for match_id, similarity, _rationale in matches:
        for rem in remediations_for_incident(engine, match_id):
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
                entry["score"] += similarity
            if entry["sample_target"] is None:
                raw_target = rem.get("target")
                entry["sample_target"] = engine.identity.canonical(raw_target, None) if raw_target else None

    out: list[dict] = []
    for action, entry in bucket.items():
        total = entry["total"]
        successes = entry["successes"]
        success_rate = successes / total if total else 0.0
        sim_score = entry["score"] / max(len(matches), 1)
        knowledge_rate = engine.knowledge.remediation_success_rate(action, query_service_id)
        rel_weight = engine.relationships.action_weight(action, query_ts) if getattr(engine, "relationships", None) else 0.0

        # Mix historical success, similarity, and adaptive priors.
        conf = (0.50 * success_rate) + (0.25 * sim_score) + (0.15 * knowledge_rate) + (0.10 * max(0.0, rel_weight))
        conf = max(0.0, min(1.0, conf))

        target = entry["sample_target"] or query_service_name or "unknown"
        out.append({
            "action": action,
            "target": target,
            "historical_outcome": f"resolved {successes}/{total}",
            "confidence": round(conf, 4),
        })

    out.sort(key=lambda r: r["confidence"], reverse=True)
    return out[:top_n]
