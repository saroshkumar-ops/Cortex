"""Bench adapter — thin shim conforming to the Anvil-P-E Adapter contract.

The Engine is the integration point for all four layers:
  - storage substrate    (Person A): event log, identity, indices
  - signature & matching (Person B): role-tokens, MinHash, LSH matcher
  - causal + memory      (Person C): chain builder, remediation aggregation,
                                     feedback loop, narrative composition
"""

import json
import os
from typing import Iterable, Literal
from pce.schema import Event, IncidentSignal, Context


class Adapter:
    def ingest(self, events: Iterable[Event]) -> None:
        raise NotImplementedError

    def reconstruct_context(
        self,
        signal: IncidentSignal,
        mode: Literal["fast", "deep"] = "fast",
    ) -> Context:
        raise NotImplementedError

    def close(self) -> None:
        pass


class Engine(Adapter):
    def __init__(self) -> None:
        from pce.store.event_log import EventLog
        from pce.store.identity import IdentityResolver
        from pce.store.indices import Indices
        from pce.store.templates import TemplateRegistry
        from pce.signature.matcher import Matcher
        from pce.memory.incident_memory import IncidentMemory
        from pce.memory.knowledge_graph import KnowledgeGraph
        from pce.memory.relationship import RelationshipMemory
        from pce.learning.learner import LearningEngine
        from pce.retrieval.hybrid import HybridRetriever

        self.log = EventLog()
        self.identity = IdentityResolver()
        self.indices = Indices()
        self.templates = TemplateRegistry()
        self.matcher = Matcher()
        self.incident_memory = IncidentMemory()
        self.knowledge = KnowledgeGraph()
        self.relationships = RelationshipMemory()
        self.learning = LearningEngine(self.knowledge, self.relationships)
        self.feedback = self.learning.feedback
        self.retriever = HybridRetriever(self.incident_memory)
        # Track which incidents we've seen a signal for, so we know when to
        # register past incidents with the matcher and when to apply feedback.
        self._signal_seen: set[str] = set()
        self._resolved: set[str] = set()

        self._persist_path = os.environ.get("PCE_PERSIST_PATH")
        self._persist_fh = None

        if self._persist_path and os.path.isfile(self._persist_path):
            with open(self._persist_path, "r", encoding="utf-8") as f:
                events = [json.loads(line) for line in f if line.strip()]
            if events:
                # Replay historical events without re-persisting them.
                self.ingest(events, persist=False)

        if self._persist_path:
            self._persist_fh = open(self._persist_path, "a", encoding="utf-8")

    def ingest(self, events: Iterable[Event], *, persist: bool = True) -> None:
        for raw in events:
            raw_for_persist = dict(raw)
            kind = raw.get("kind")
            if kind == "topology":
                if raw.get("change") == "rename":
                    src = raw.get("from_") or raw.get("from") or raw.get("service")
                    before = self.identity.canonical(src, raw.get("ts")) if src else None
                    self.identity.observe_topology(raw)
                    after = self.identity.canonical(src, None) if src else None
                    if before and after and before != after:
                        self.indices.reindex_service(before, after)
                else:
                    self.identity.observe_topology(raw)
                    change = raw.get("change") or ""
                    if change in {"dep_add", "dep_remove"}:
                        src = raw.get("from_") or raw.get("from") or raw.get("service")
                        dst = raw.get("to")
                        src_id = self.identity.canonical_id(src, raw.get("ts")) if src else None
                        dst_id = self.identity.canonical_id(dst, raw.get("ts")) if dst else None
                        self.knowledge.record_dependency(change, src_id, dst_id)

            # Log templating: assign every log event to a structural template
            # so behavioral abstraction can key on shape, not on raw text.
            # The raw msg is preserved on the event for explainability; only
            # the matcher's tokens consume `template_id`.
            if kind == "log":
                from pce.store.event_log import _parse_ts as _pts
                msg = raw.get("msg") or ""
                template_id, params = self.templates.template_for(msg, _pts(raw.get("ts", "")))
                if template_id >= 0:
                    raw["template_id"] = template_id
                    if params:
                        raw["template_params"] = params

            event_id = self.log.append(raw)
            canonical_service = self._canonical_for(raw)
            canonical_service_id = self._canonical_id_for(raw)
            self.indices.index(event_id, raw, canonical_service, canonical_service_id)
            if kind:
                self.knowledge.record_event(kind, canonical_service_id)

            if kind == "incident_signal":
                inc_id = raw.get("incident_id")
                if inc_id:
                    self._signal_seen.add(inc_id)
            elif kind == "remediation":
                inc_id = raw.get("incident_id")
                if inc_id and inc_id in self._signal_seen:
                    from pce.memory.incident_extractor import extract_episode
                    # The past incident's window is now complete. Register its
                    # behavioral signature so future queries can find it.
                    self.matcher.register(self, inc_id)
                    self._resolved.add(inc_id)
                    episode = extract_episode(self, inc_id, mode="deep")
                    if episode is not None:
                        self.incident_memory.upsert(episode)
                    # Apply graded feedback if we previously surfaced matches
                    # for this incident at query time.
                    self.learning.on_remediation(self, raw, episode)

            if persist and self._persist_fh is not None:
                self._persist_fh.write(json.dumps(raw_for_persist) + "\n")
        if persist and self._persist_fh is not None:
            self._persist_fh.flush()

    def reconstruct_context(
        self,
        signal: IncidentSignal,
        mode: Literal["fast", "deep"] = "fast",
    ) -> Context:
        from pce.reconstruct import reconstruct
        return reconstruct(self, signal, mode=mode)

    def close(self) -> None:
        if self._persist_fh is not None:
            self._persist_fh.close()

    def _canonical_for(self, event: Event) -> str | None:
        svc = event.get("service") or event.get("target")
        if not svc:
            return None
        # Index under the latest canonical name so pre-rename events are
        # discoverable under the current service identity.
        return self.identity.canonical(svc, None)

    def _canonical_id_for(self, event: Event) -> int | None:
        svc = event.get("service") or event.get("target")
        if not svc:
            return None
        return self.identity.canonical_id(svc, None)
