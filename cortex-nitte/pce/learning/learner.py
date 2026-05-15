"""Adaptive learning engine: reinforcement + decay updates."""

from __future__ import annotations

from pce.memory.decay import FeedbackLoop
from pce.memory.knowledge_graph import KnowledgeGraph
from pce.memory.relationship import RelationshipMemory
from pce.store.event_log import _parse_ts


_RESOLVED_OUTCOMES = {"resolved", "success", "fixed", "ok"}


class LearningEngine:
    __slots__ = ("feedback", "knowledge", "relationships")

    def __init__(self, knowledge: KnowledgeGraph, relationships: RelationshipMemory) -> None:
        self.feedback = FeedbackLoop()
        self.knowledge = knowledge
        self.relationships = relationships

    def record_query_matches(self, incident_id: str, matches: list[tuple[str, float, set[str]]]) -> None:
        self.feedback.record_query_matches(incident_id, matches)

    def on_remediation(self, engine, remediation_event: dict, episode) -> None:
        outcome = (remediation_event.get("outcome") or "").lower()
        success = outcome in _RESOLVED_OUTCOMES
        ts = _parse_ts(remediation_event.get("ts", ""))
        action = remediation_event.get("action") or ""

        target = remediation_event.get("target") or remediation_event.get("service")
        target_id = engine.identity.canonical_id(target, remediation_event.get("ts")) if target else None
        self.knowledge.record_remediation(action, outcome, target_id, ts)
        self.relationships.reinforce_action(action, success, ts)

        # Reinforce incident-pair similarity weights
        self.feedback.on_remediation(engine, remediation_event)

        # Reinforce causal edges for this incident episode
        if episode is None:
            return
        for edge in episode.causal_chain:
            try:
                cause_id = int(edge["cause_event_id"])
                effect_id = int(edge["effect_event_id"])
            except (KeyError, ValueError, TypeError):
                continue
            cause = engine.log.get(cause_id)
            effect = engine.log.get(effect_id)
            c_kind = cause.get("kind", "")
            e_kind = effect.get("kind", "")
            c_svc = engine.identity.canonical_id(cause.get("service") or cause.get("target"), cause.get("ts"))
            e_svc = engine.identity.canonical_id(effect.get("service") or effect.get("target"), effect.get("ts"))
            self.knowledge.record_causal_edge(c_kind, e_kind, c_svc, e_svc, success, ts)
            self.relationships.reinforce_edge(c_kind, e_kind, success, ts)
