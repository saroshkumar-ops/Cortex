"""Type definitions matching the Anvil-P-E bench harness contract (Annex A)."""

from typing import TypedDict, Literal, Any


class Event(TypedDict, total=False):
    ts: str
    kind: Literal["deploy", "log", "metric", "trace", "topology", "incident_signal", "remediation"]
    service: str
    version: str
    actor: str
    level: str
    msg: str
    trace_id: str
    name: str
    value: float
    spans: list[dict]
    change: str
    to: str
    incident_id: str
    trigger: str
    action: str
    target: str
    outcome: str
    event_id: int


class IncidentSignal(TypedDict, total=False):
    ts: str
    kind: Literal["incident_signal"]
    incident_id: str
    trigger: str


class CausalEdge(TypedDict, total=False):
    cause_event_id: str
    effect_event_id: str
    evidence: str
    confidence: float


class IncidentMatch(TypedDict, total=False):
    incident_id: str
    similarity: float
    rationale: str


class Remediation(TypedDict):
    action: str
    target: str
    historical_outcome: str
    confidence: float


class Context(TypedDict):
    related_events: list[Event]
    causal_chain: list[CausalEdge]
    similar_past_incidents: list[IncidentMatch]
    suggested_remediations: list[Remediation]
    confidence: float
    explain: str


def empty_context() -> Context:
    return {
        "related_events": [],
        "causal_chain": [],
        "similar_past_incidents": [],
        "suggested_remediations": [],
        "confidence": 0.0,
        "explain": "",
    }
