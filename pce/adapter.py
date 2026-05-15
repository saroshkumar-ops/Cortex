"""Bench adapter — thin shim conforming to the Anvil-P-E Adapter contract.

The Engine is the integration point for all four layers:
  - storage substrate    (Person A): event log, identity, indices
  - signature & matching (Person B): role-tokens, MinHash, LSH matcher
  - causal + memory      (Person C): chain builder, remediation aggregation,
                                     feedback loop, narrative composition
"""

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

    def ingest(self, events: Iterable[Event]) -> None:
        for raw in events:
            kind = raw.get("kind")
            if kind == "topology":
                self.identity.observe_topology(raw)

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

    def reconstruct_context(
        self,
        signal: IncidentSignal,
        mode: Literal["fast", "deep"] = "fast",
    ) -> Context:
        from pce.reconstruct import reconstruct
        return reconstruct(self, signal, mode=mode)

    def close(self) -> None:
        pass

    def _canonical_for(self, event: Event) -> str | None:
        svc = event.get("service") or event.get("target")
        if not svc:
            return None
        ts = event.get("ts", "")
        return self.identity.canonical(svc, ts)
