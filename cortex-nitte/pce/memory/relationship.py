"""Probabilistic relationship memory with reinforcement and decay."""

from __future__ import annotations

from dataclasses import dataclass
import math


_HALFLIFE_S = 7 * 24 * 3600


@dataclass
class WeightedRelation:
    weight: float = 0.0
    last_ts: float = 0.0

    def apply(self, delta: float, ts: float) -> None:
        decayed = self.decayed_weight(ts)
        self.weight = max(-1.0, min(1.0, decayed + delta))
        self.last_ts = max(self.last_ts, ts)

    def decayed_weight(self, ts: float) -> float:
        if self.last_ts <= 0.0:
            return self.weight
        dt = max(0.0, ts - self.last_ts)
        factor = 0.5 ** (dt / _HALFLIFE_S)
        return self.weight * factor


class RelationshipMemory:
    __slots__ = ("edge_weights", "action_weights")

    def __init__(self) -> None:
        self.edge_weights: dict[tuple[str, str], WeightedRelation] = {}
        self.action_weights: dict[str, WeightedRelation] = {}

    def reinforce_edge(self, cause_kind: str, effect_kind: str, success: bool, ts: float) -> None:
        if not cause_kind or not effect_kind:
            return
        key = (cause_kind, effect_kind)
        rel = self.edge_weights.setdefault(key, WeightedRelation())
        delta = 0.08 if success else -0.05
        rel.apply(delta, ts)

    def reinforce_action(self, action: str, success: bool, ts: float) -> None:
        if not action:
            return
        rel = self.action_weights.setdefault(action, WeightedRelation())
        delta = 0.10 if success else -0.06
        rel.apply(delta, ts)

    def edge_weight(self, cause_kind: str, effect_kind: str, ts: float) -> float:
        rel = self.edge_weights.get((cause_kind, effect_kind))
        if rel is None:
            return 0.0
        return rel.decayed_weight(ts)

    def action_weight(self, action: str, ts: float) -> float:
        rel = self.action_weights.get(action)
        if rel is None:
            return 0.0
        return rel.decayed_weight(ts)
