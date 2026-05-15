"""Lightweight knowledge graph of services, causal edges, and remediations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


_RESOLVED_OUTCOMES = {"resolved", "success", "fixed", "ok"}


@dataclass
class EdgeStats:
    count: int = 0
    success: int = 0
    last_ts: float = 0.0

    def record(self, success: bool, ts: float) -> None:
        self.count += 1
        if success:
            self.success += 1
        self.last_ts = max(self.last_ts, ts)

    def success_rate(self) -> float:
        if self.count <= 0:
            return 0.0
        return self.success / self.count


@dataclass
class RemediationStats:
    count: int = 0
    success: int = 0
    last_ts: float = 0.0

    def record(self, success: bool, ts: float) -> None:
        self.count += 1
        if success:
            self.success += 1
        self.last_ts = max(self.last_ts, ts)

    def success_rate(self) -> float:
        if self.count <= 0:
            return 0.0
        return self.success / self.count


class KnowledgeGraph:
    __slots__ = (
        "event_counts",
        "causal_edges",
        "service_edges",
        "remediation_stats",
        "remediation_by_service",
        "dependencies_out",
        "dependencies_in",
    )

    def __init__(self) -> None:
        self.event_counts: dict[int, dict[str, int]] = {}
        self.causal_edges: dict[tuple[str, str], EdgeStats] = {}
        self.service_edges: dict[tuple[int, int], EdgeStats] = {}
        self.remediation_stats: dict[str, RemediationStats] = {}
        self.remediation_by_service: dict[tuple[int, str], RemediationStats] = {}
        self.dependencies_out: dict[int, set[int]] = {}
        self.dependencies_in: dict[int, set[int]] = {}

    def record_event(self, kind: str, service_id: int | None) -> None:
        if service_id is None or not kind:
            return
        bucket = self.event_counts.setdefault(service_id, {})
        bucket[kind] = bucket.get(kind, 0) + 1

    def record_causal_edge(
        self,
        cause_kind: str,
        effect_kind: str,
        cause_service_id: int | None,
        effect_service_id: int | None,
        success: bool,
        ts: float,
    ) -> None:
        if cause_kind and effect_kind:
            self.causal_edges.setdefault((cause_kind, effect_kind), EdgeStats()).record(success, ts)
        if cause_service_id is not None and effect_service_id is not None:
            key = (cause_service_id, effect_service_id)
            self.service_edges.setdefault(key, EdgeStats()).record(success, ts)

    def record_remediation(self, action: str, outcome: str, service_id: int | None, ts: float) -> None:
        if not action:
            return
        success = self._is_success(outcome)
        self.remediation_stats.setdefault(action, RemediationStats()).record(success, ts)
        if service_id is not None:
            key = (service_id, action)
            self.remediation_by_service.setdefault(key, RemediationStats()).record(success, ts)

    def edge_success_rate(self, cause_kind: str, effect_kind: str) -> float:
        stats = self.causal_edges.get((cause_kind, effect_kind))
        return stats.success_rate() if stats else 0.0

    def service_edge_success_rate(self, cause_service_id: int, effect_service_id: int) -> float:
        stats = self.service_edges.get((cause_service_id, effect_service_id))
        return stats.success_rate() if stats else 0.0

    def remediation_success_rate(self, action: str, service_id: int | None = None) -> float:
        if service_id is not None:
            stats = self.remediation_by_service.get((service_id, action))
            if stats:
                return stats.success_rate()
        stats = self.remediation_stats.get(action)
        return stats.success_rate() if stats else 0.0

    def record_dependency(self, change: str, src_id: int | None, dst_id: int | None) -> None:
        if src_id is None or dst_id is None:
            return
        if change == "dep_add":
            self.dependencies_out.setdefault(src_id, set()).add(dst_id)
            self.dependencies_in.setdefault(dst_id, set()).add(src_id)
        elif change == "dep_remove":
            self.dependencies_out.get(src_id, set()).discard(dst_id)
            self.dependencies_in.get(dst_id, set()).discard(src_id)

    @staticmethod
    def _is_success(outcome: str) -> bool:
        return (outcome or "").lower() in _RESOLVED_OUTCOMES
