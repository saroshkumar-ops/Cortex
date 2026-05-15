"""Causal chain construction — temporally-ordered (cause -> effect) edges.

Builds a chain *backwards* from the incident signal: for each effect, find
the best plausible cause earlier in the window, then make that cause the
next effect. Stops when no plausible cause is found or `max_depth` reached.

Confidence per edge is probabilistic, combining temporal proximity, causal
affinity, topology proximity, and historical confirmation.
"""

from pce.schema import CausalEdge
from pce.causal.probabilistic import score_edge as probabilistic_score


# Plausibility that an event of kind `cause` causes an event of kind `effect`.
# Used as a base score; bonuses for trace/service alignment stack on top.
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


def _score_edge(engine, cause_id: int, effect_id: int) -> tuple[float, list[str]]:
    return probabilistic_score(engine, cause_id, effect_id)


def build_chain(
    engine,
    signal_event_id: int,
    window_ids: list[int],
    max_depth: int = 5,
    min_edge_confidence: float = 0.30,
    mode: str = "fast",
) -> list[CausalEdge]:
    """Walk backwards from the signal, emitting (cause -> effect) edges.

    Returns edges *forward-ordered* (root cause first, signal last) — the
    chain reads naturally that way and matches the worked example
    (deploy -> latency spike -> upstream error -> incident).
    """
    # Index window events by id for quick membership tests.
    window_set = set(window_ids)
    if signal_event_id not in window_set:
        window_set.add(signal_event_id)

    edges_backward: list[CausalEdge] = []
    used: set[int] = {signal_event_id}
    current_effect = signal_event_id

    min_conf = min_edge_confidence if mode == "fast" else min_edge_confidence * 0.85

    for _ in range(max_depth):
        best_score = -1.0
        best_cause = -1
        best_reasons: list[str] = []

        effect_ts = engine.log.ts_of(current_effect)

        for cand_id in window_ids:
            if cand_id in used:
                continue
            if engine.log.ts_of(cand_id) >= effect_ts:
                continue  # must precede the effect
            score, reasons = _score_edge(engine, cand_id, current_effect)
            if score > best_score:
                best_score = score
                best_cause = cand_id
                best_reasons = reasons

        if best_cause < 0 or best_score < min_conf:
            break

        cause_event = engine.log.get(best_cause)
        effect_event = engine.log.get(current_effect)
        cause_ts = str(cause_event.get("ts", ""))
        effect_ts = str(effect_event.get("ts", ""))

        # Stringify event ids and render a human-readable evidence summary.
        evidence_str = ", ".join(best_reasons) if best_reasons else f"#{best_cause}->#{current_effect}"
        edges_backward.append({
            "cause_event_id": str(best_cause),
            "effect_event_id": str(current_effect),
            "cause_id": str(best_cause),
            "effect_id": str(current_effect),
            "evidence": evidence_str,
            "confidence": round(best_score, 4),
            "timestamps": {
                "cause_ts": cause_ts,
                "effect_ts": effect_ts,
            },
        })
        used.add(best_cause)
        current_effect = best_cause

    # Reverse so the chain reads root-cause -> signal
    return list(reversed(edges_backward))
