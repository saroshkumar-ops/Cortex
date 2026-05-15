"""Hybrid incident retrieval: lexical + structural + temporal + symptom overlap."""

from __future__ import annotations

from typing import Iterable

from pce.ranking.scorer import score_incident
from pce.signature.matcher import render_rationale
from pce.signature import shape


class HybridRetriever:
    __slots__ = ("incident_memory",)

    def __init__(self, incident_memory) -> None:
        self.incident_memory = incident_memory

    def find_similar(self, engine, query_episode, mode: str = "fast", top_k: int = 5) -> list[tuple[str, float, str]]:
        if query_episode is None:
            return []
        query_sig = query_episode.signature
        query_id = query_episode.incident_id

        candidates = self._collect_candidates(engine, query_episode, mode)
        if not candidates:
            return []

        scored: list[tuple[str, float, str]] = []
        now_ts = query_episode.signal_ts
        for cand_id in candidates:
            cand = self.incident_memory.get(cand_id)
            if cand is None:
                continue
            overlap_tokens = query_sig.behavior_token_set() & cand.signature.behavior_token_set()
            lexical_sim = shape.exact_jaccard(query_sig.behavior_token_set(), cand.signature.behavior_token_set())
            lexical_sim += engine.matcher.pair_weight(query_id, cand_id)
            lexical_sim = max(0.0, min(1.0, lexical_sim))
            score, features = score_incident(
                engine,
                query_sig,
                cand.signature,
                mode=mode,
                lexical_sim=lexical_sim,
                now_ts=now_ts,
            )
            rationale = _render_hybrid_rationale(
                query_sig,
                cand.signature,
                overlap_tokens,
                features,
            )
            scored.append((cand_id, score, rationale))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    def _collect_candidates(self, engine, query_episode, mode: str) -> list[str]:
        query_id = query_episode.incident_id
        query_sig = query_episode.signature

        max_candidates = 120 if mode == "fast" else 300
        candidates: list[str] = []
        seen: set[str] = set()

        # 1) Lexical / MinHash candidates
        for cand_id in engine.matcher.candidate_ids(engine, query_id):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)
            if len(candidates) >= max_candidates:
                return candidates

        # 2) Symptom overlap
        for cand_id in self.incident_memory.candidates_by_symptoms(query_sig.symptom_types):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)
            if len(candidates) >= max_candidates:
                return candidates

        # 3) Temporal overlap
        for cand_id in self.incident_memory.candidates_by_temporal(query_sig.temporal_buckets):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)
            if len(candidates) >= max_candidates:
                return candidates

        # 4) Service clusters / IDs
        for cand_id in self.incident_memory.candidates_by_clusters(query_sig.involved_service_clusters):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)
            if len(candidates) >= max_candidates:
                return candidates

        for cand_id in self.incident_memory.candidates_by_service_ids(query_sig.involved_service_ids):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)
            if len(candidates) >= max_candidates:
                return candidates

        # 5) Graph tokens (deep mode prefers more)
        graph_limit = 8 if mode == "fast" else None
        for cand_id in self.incident_memory.candidates_by_graph_tokens(query_sig.graph_tokens, graph_limit):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)
            if len(candidates) >= max_candidates:
                return candidates

        # 6) Remediation overlap (if any history exists)
        if query_sig.remediation_actions:
            for cand_id in self.incident_memory.candidates_by_actions(query_sig.remediation_actions):
                if cand_id == query_id or cand_id in seen:
                    continue
                seen.add(cand_id)
                candidates.append(cand_id)
                if len(candidates) >= max_candidates:
                    return candidates

        if not candidates:
            # Fallback to all known episodes (bounded)
            for cand_id in self.incident_memory.all_ids():
                if cand_id == query_id or cand_id in seen:
                    continue
                candidates.append(cand_id)
                if len(candidates) >= max_candidates:
                    break

        return candidates


def _render_hybrid_rationale(query_sig, cand_sig, overlap_tokens: set[str], features: dict[str, float]) -> str:
    parts: list[str] = []

    if overlap_tokens:
        parts.append(render_rationale(overlap_tokens))

    symptom_overlap = query_sig.symptom_set() & cand_sig.symptom_set()
    if symptom_overlap:
        parts.append("shared symptoms: " + ", ".join(sorted(symptom_overlap)[:3]))

    graph_overlap = query_sig.graph_token_set() & cand_sig.graph_token_set()
    if graph_overlap:
        parts.append("shared causal structure")

    temporal_overlap = query_sig.temporal_set() & cand_sig.temporal_set()
    if temporal_overlap:
        parts.append("similar timing")

    remediation_overlap = query_sig.remediation_action_set() & cand_sig.remediation_action_set()
    if remediation_overlap:
        parts.append("shared remediation history")

    if not parts:
        parts.append("multi-signal similarity")

    return "; ".join(parts)
