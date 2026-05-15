"""Incident memory store with retrieval-friendly indices."""

from __future__ import annotations

from typing import Iterable

from pce.schemas.incident import IncidentEpisode


class IncidentMemory:
    __slots__ = (
        "_episodes",
        "by_symptom",
        "by_action",
        "by_cluster",
        "by_temporal",
        "by_graph_token",
        "by_service_id",
    )

    def __init__(self) -> None:
        self._episodes: dict[str, IncidentEpisode] = {}
        self.by_symptom: dict[str, set[str]] = {}
        self.by_action: dict[str, set[str]] = {}
        self.by_cluster: dict[str, set[str]] = {}
        self.by_temporal: dict[str, set[str]] = {}
        self.by_graph_token: dict[str, set[str]] = {}
        self.by_service_id: dict[int, set[str]] = {}

    def upsert(self, episode: IncidentEpisode) -> None:
        existing = self._episodes.get(episode.incident_id)
        if existing is not None:
            self._deindex(existing)
        self._episodes[episode.incident_id] = episode
        self._index(episode)

    def get(self, incident_id: str) -> IncidentEpisode | None:
        return self._episodes.get(incident_id)

    def all_ids(self) -> list[str]:
        return list(self._episodes.keys())

    def all_episodes(self) -> list[IncidentEpisode]:
        return list(self._episodes.values())

    def candidates_by_symptoms(self, symptoms: Iterable[str]) -> set[str]:
        return self._collect(self.by_symptom, symptoms)

    def candidates_by_actions(self, actions: Iterable[str]) -> set[str]:
        return self._collect(self.by_action, actions)

    def candidates_by_clusters(self, clusters: Iterable[str]) -> set[str]:
        return self._collect(self.by_cluster, clusters)

    def candidates_by_temporal(self, buckets: Iterable[str]) -> set[str]:
        return self._collect(self.by_temporal, buckets)

    def candidates_by_graph_tokens(self, tokens: Iterable[str], limit_tokens: int | None = None) -> set[str]:
        if limit_tokens is None:
            return self._collect(self.by_graph_token, tokens)
        chosen = list(tokens)[:limit_tokens]
        return self._collect(self.by_graph_token, chosen)

    def candidates_by_service_ids(self, service_ids: Iterable[int]) -> set[str]:
        return self._collect(self.by_service_id, service_ids)

    # ---- internals ----

    def _index(self, episode: IncidentEpisode) -> None:
        sig = episode.signature
        for s in sig.symptom_types:
            self.by_symptom.setdefault(s, set()).add(episode.incident_id)
        for a in sig.remediation_actions:
            self.by_action.setdefault(a, set()).add(episode.incident_id)
        for c in sig.involved_service_clusters:
            self.by_cluster.setdefault(c, set()).add(episode.incident_id)
        for b in sig.temporal_buckets:
            self.by_temporal.setdefault(b, set()).add(episode.incident_id)
        for t in sig.graph_tokens:
            self.by_graph_token.setdefault(t, set()).add(episode.incident_id)
        for sid in sig.involved_service_ids:
            self.by_service_id.setdefault(sid, set()).add(episode.incident_id)

    def _deindex(self, episode: IncidentEpisode) -> None:
        sig = episode.signature
        self._discard(self.by_symptom, sig.symptom_types, episode.incident_id)
        self._discard(self.by_action, sig.remediation_actions, episode.incident_id)
        self._discard(self.by_cluster, sig.involved_service_clusters, episode.incident_id)
        self._discard(self.by_temporal, sig.temporal_buckets, episode.incident_id)
        self._discard(self.by_graph_token, sig.graph_tokens, episode.incident_id)
        self._discard(self.by_service_id, sig.involved_service_ids, episode.incident_id)

    @staticmethod
    def _discard(index: dict, keys: Iterable, incident_id: str) -> None:
        for k in keys:
            bucket = index.get(k)
            if not bucket:
                continue
            bucket.discard(incident_id)
            if not bucket:
                index.pop(k, None)

    @staticmethod
    def _collect(index: dict, keys: Iterable) -> set[str]:
        out: set[str] = set()
        for k in keys:
            bucket = index.get(k)
            if bucket:
                out.update(bucket)
        return out
