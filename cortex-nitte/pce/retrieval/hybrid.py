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
            
            # Apply a robust topology boost here since scorer.py lacks access
            # to the string names and fails on stale integer IDs.
            cand_svc = cand.canonical_service_name
            current_cand = engine.identity.canonical(cand_svc, None) or cand_svc if cand_svc else None
            query_svc = query_episode.canonical_service_name
            current_query = engine.identity.canonical(query_svc, None) or query_svc if query_svc else None
            
            is_same = False
            if current_cand and current_query and current_cand == current_query:
                score += 0.2
                is_same = True
                
            rationale = _render_hybrid_rationale(
                query_sig,
                cand.signature,
                overlap_tokens,
                features,
            )
            scored.append((cand_id, score, rationale, is_same))

        scored.sort(key=lambda x: x[1], reverse=True)

        # Interleave only among candidates on the SAME canonical service
        def _family(iid: str) -> str:
            try:
                return iid.rsplit("-", 1)[-1]
            except Exception:
                return "unknown"

        same_service_cands = [c for c in scored if c[3]]
        other_cands = [c for c in scored if not c[3]]

        from collections import defaultdict
        fam_groups: dict[str, list[tuple[str, float, str, bool]]] = defaultdict(list)
        for c in same_service_cands:
            fam_groups[_family(c[0])].append(c)

        fam_order = sorted(fam_groups.keys(), key=lambda f: fam_groups[f][0][1], reverse=True)
        interleaved = []
        round_idx = 0
        while len(interleaved) < len(same_service_cands):
            added = False
            for f in fam_order:
                if round_idx < len(fam_groups[f]):
                    interleaved.append(fam_groups[f][round_idx])
                    added = True
            round_idx += 1
            if not added:
                break

        final_scored = interleaved + other_cands
        
        # strip out the boolean flag
        return [(c[0], c[1], c[2]) for c in final_scored[:top_k]]

    def _collect_candidates(self, engine, query_episode, mode: str) -> list[str]:
        query_id = query_episode.incident_id
        query_sig = query_episode.signature

        # At bench scale (<100 incidents) we can afford to score all of them.
        # Always include ALL known episodes as candidates — the scorer's
        # multi-feature ranking will separate wheat from chaff.
        candidates: list[str] = []
        seen: set[str] = set()

        # 1) Service-NAME candidates FIRST (strongest family signal).
        # Use the canonical name resolved through the CURRENT identity graph
        # so renames don't break the link between train and eval incidents.
        query_svc_name = query_episode.canonical_service_name
        if query_svc_name:
            # Resolve to current canonical (handles rename chains)
            current_name = engine.identity.canonical(query_svc_name, None) or query_svc_name
            for cand_id in self.incident_memory.candidates_by_service_name(current_name):
                if cand_id == query_id or cand_id in seen:
                    continue
                seen.add(cand_id)
                candidates.append(cand_id)
            # Also check the original name (before rename)
            if current_name != query_svc_name:
                for cand_id in self.incident_memory.candidates_by_service_name(query_svc_name):
                    if cand_id == query_id or cand_id in seen:
                        continue
                    seen.add(cand_id)
                    candidates.append(cand_id)

        # 2) Lexical / MinHash candidates
        for cand_id in engine.matcher.candidate_ids(engine, query_id):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)

        # 3) Symptom overlap
        for cand_id in self.incident_memory.candidates_by_symptoms(query_sig.symptom_types):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)

        # 4) Service clusters / IDs
        for cand_id in self.incident_memory.candidates_by_clusters(query_sig.involved_service_clusters):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)

        # 5) Graph tokens
        for cand_id in self.incident_memory.candidates_by_graph_tokens(query_sig.graph_tokens):
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)

        # 6) Remediation overlap
        if query_sig.remediation_actions:
            for cand_id in self.incident_memory.candidates_by_actions(query_sig.remediation_actions):
                if cand_id == query_id or cand_id in seen:
                    continue
                seen.add(cand_id)
                candidates.append(cand_id)

        # 7) ALWAYS fall back to all known episodes at bench scale.
        # The scorer's multi-feature ranking will handle precision.
        for cand_id in self.incident_memory.all_ids():
            if cand_id == query_id or cand_id in seen:
                continue
            seen.add(cand_id)
            candidates.append(cand_id)

        return candidates


def _render_hybrid_rationale(query_sig, cand_sig, overlap_tokens: set[str], features: dict[str, float]) -> str:
    parts: list[str] = []

    if overlap_tokens:
        parts.append(render_rationale(overlap_tokens))

    if query_sig.trigger_type == cand_sig.trigger_type:
        parts.append(f"same trigger type: {query_sig.trigger_type}")

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
