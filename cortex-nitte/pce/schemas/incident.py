"""Internal incident memory schemas."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class IncidentSignature:
    trigger_type: str
    symptom_types: frozenset[str]
    causal_pattern: tuple[str, ...]
    involved_service_ids: frozenset[int]
    involved_service_clusters: frozenset[str]
    remediation_actions: tuple[str, ...]
    remediation_outcomes: tuple[str, ...]
    temporal_buckets: frozenset[str]
    graph_tokens: frozenset[str]
    behavior_tokens: frozenset[str]
    minhash_signature: tuple[int, ...]

    def remediation_action_set(self) -> set[str]:
        return set(self.remediation_actions)

    def symptom_set(self) -> set[str]:
        return set(self.symptom_types)

    def temporal_set(self) -> set[str]:
        return set(self.temporal_buckets)

    def graph_token_set(self) -> set[str]:
        return set(self.graph_tokens)

    def behavior_token_set(self) -> set[str]:
        return set(self.behavior_tokens)


@dataclass
class IncidentEpisode:
    incident_id: str
    signal_event_id: int
    signal_ts: float
    canonical_service_id: int | None
    canonical_service_name: str | None
    window_event_ids: list[int]
    signature: IncidentSignature
    causal_chain: list[dict]
    remediation_outcome: str | None = None


def to_frozenset(items: Iterable[str]) -> frozenset[str]:
    return frozenset(items)
