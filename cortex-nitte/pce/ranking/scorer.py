"""Feature-based scoring for incident similarity."""

from __future__ import annotations

from pce.signature import shape


FAST_WEIGHTS = {
    "lexical": 0.45,
    "symptom": 0.20,
    "temporal": 0.15,
    "graph": 0.10,
    "topology": 0.10,
    "trigger": 0.00,
    "pattern": 0.00,
    "remediation": 0.00,
}

DEEP_WEIGHTS = {
    "lexical": 0.45,
    "symptom": 0.20,
    "temporal": 0.15,
    "graph": 0.10,
    "topology": 0.10,
    "trigger": 0.00,
    "pattern": 0.00,
    "remediation": 0.00,
}


def score_incident(
    engine,
    query_sig,
    cand_sig,
    mode: str = "fast",
    lexical_sim: float | None = None,
    now_ts: float | None = None,
) -> tuple[float, dict[str, float]]:
    if lexical_sim is None:
        lexical_sim = shape.exact_jaccard(query_sig.behavior_token_set(), cand_sig.behavior_token_set())

    symptom_sim = _jaccard(query_sig.symptom_set(), cand_sig.symptom_set())
    temporal_sim = _jaccard(query_sig.temporal_set(), cand_sig.temporal_set())
    graph_sim = _jaccard(query_sig.graph_token_set(), cand_sig.graph_token_set())
    remediation_sim = _jaccard(query_sig.remediation_action_set(), cand_sig.remediation_action_set())
    pattern_sim = _jaccard(set(query_sig.causal_pattern), set(cand_sig.causal_pattern))
    topology_sim = _topology_similarity(engine, query_sig, cand_sig)
    trigger_sim = 1.0 if query_sig.trigger_type == cand_sig.trigger_type else 0.0

    weights = FAST_WEIGHTS if mode == "fast" else DEEP_WEIGHTS
    features = {
        "lexical": lexical_sim,
        "symptom": symptom_sim,
        "temporal": temporal_sim,
        "graph": graph_sim,
        "remediation": remediation_sim,
        "pattern": pattern_sim,
        "topology": topology_sim,
        "trigger": trigger_sim,
    }

    score = 0.0
    for key, w in weights.items():
        score += w * features.get(key, 0.0)

    # Relationship memory boost (calibrated, small)
    if now_ts is not None:
        rel_boost = _relationship_boost(engine, query_sig, now_ts)
        score += rel_boost

    score = max(0.0, min(1.0, score))
    return score, features


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _topology_similarity(engine, query_sig, cand_sig) -> float:
    q_ids = set(query_sig.involved_service_ids)
    c_ids = set(cand_sig.involved_service_ids)
    if not q_ids or not c_ids:
        return 0.0

    # Resolve stored service IDs to current canonical names (handles
    # rename-induced ID merges where the stored ID may be orphaned).
    q_names = set()
    for sid in q_ids:
        name = engine.identity.canonical_name(sid)
        if name:
            # Resolve to current canonical to handle rename chains
            current = engine.identity.canonical(name, None) or name
            q_names.add(current)

    c_names = set()
    for sid in c_ids:
        name = engine.identity.canonical_name(sid)
        if name:
            current = engine.identity.canonical(name, None) or name
            c_names.add(current)

    if q_names and c_names and q_names & c_names:
        return 1.0

    # Direct ID overlap (if names couldn't be resolved)
    if q_ids & c_ids:
        return 0.8

    # Check direct dependency neighbors
    for sid in q_ids:
        neighbors = engine.identity.neighbors(sid)
        if neighbors & c_ids:
            return 0.5

    if set(query_sig.involved_service_clusters) & set(cand_sig.involved_service_clusters):
        return 0.3

    return 0.0


def _relationship_boost(engine, query_sig, now_ts: float) -> float:
    if not getattr(engine, "relationships", None):
        return 0.0
    weights = []
    for pattern in query_sig.causal_pattern:
        if "->" not in pattern:
            continue
        cause, effect = pattern.split("->", 1)
        weights.append(engine.relationships.edge_weight(cause, effect, now_ts))
    if not weights:
        return 0.0
    avg = sum(weights) / len(weights)
    return max(-0.05, min(0.05, 0.05 * avg))
