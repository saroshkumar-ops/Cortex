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
        from pce.memory.decay import FeedbackLoop

        self.log = EventLog()
        self.identity = IdentityResolver()
        self.indices = Indices()
        self.templates = TemplateRegistry()
        self.matcher = Matcher()
        self.feedback = FeedbackLoop()
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
                self.identity.observe_topology(raw)
                if raw.get("change") == "rename":
                    src = raw.get("from_") or raw.get("from") or raw.get("service")
                    dst = raw.get("to")
                    if src and dst:
                        self.indices.reindex_service(src, dst)

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
            self.indices.index(event_id, raw, canonical_service)

            if kind == "incident_signal":
                inc_id = raw.get("incident_id")
                if inc_id:
                    self._signal_seen.add(inc_id)
            elif kind == "remediation":
                inc_id = raw.get("incident_id")
                if inc_id and inc_id in self._signal_seen:
                    # The past incident's window is now complete. Register its
                    # behavioral signature so future queries can find it.
                    self.matcher.register(self, inc_id)
                    self._resolved.add(inc_id)
                    # Apply graded feedback if we previously surfaced matches
                    # for this incident at query time.
                    self.feedback.on_remediation(self, raw)

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
