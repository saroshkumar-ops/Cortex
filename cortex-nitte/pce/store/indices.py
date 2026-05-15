"""Inverted indices over the event log.

Three indices, all in-memory dicts keyed by the dimensions causal/signature
layers actually query:

    - by_service: canonical_service -> list[event_id]
    - by_service_id: canonical_service_id -> list[event_id]
  - by_trace:   trace_id          -> list[event_id]
  - by_bucket:  1-second time bucket (int(epoch)) -> list[event_id]
  - by_kind:    event kind        -> list[event_id]
  - by_incident: incident_id      -> list[event_id]

All values stay sorted by insertion order, which is also temporal order
because the bench feeds events monotonically. Downstream layers rely on this
to avoid re-sorting.
"""

from pce.schema import Event
from pce.store.event_log import _parse_ts


class Indices:
    __slots__ = ("by_service", "by_service_id", "by_trace", "by_bucket", "by_kind", "by_incident")

    def __init__(self) -> None:
        self.by_service: dict[str, list[int]] = {}
        self.by_service_id: dict[int, list[int]] = {}
        self.by_trace: dict[str, list[int]] = {}
        self.by_bucket: dict[int, list[int]] = {}
        self.by_kind: dict[str, list[int]] = {}
        self.by_incident: dict[str, list[int]] = {}

    def index(
        self,
        event_id: int,
        event: Event,
        canonical_service: str | None,
        canonical_service_id: int | None,
    ) -> None:
        kind = event.get("kind", "")
        if kind:
            self.by_kind.setdefault(kind, []).append(event_id)

        if canonical_service:
            self.by_service.setdefault(canonical_service, []).append(event_id)
        if canonical_service_id is not None:
            self.by_service_id.setdefault(canonical_service_id, []).append(event_id)

        trace_id = event.get("trace_id")
        if trace_id:
            self.by_trace.setdefault(trace_id, []).append(event_id)

        incident_id = event.get("incident_id")
        if incident_id:
            self.by_incident.setdefault(incident_id, []).append(event_id)

        # Trace events bundle multiple spans across services — index each.
        if kind == "trace":
            for span in event.get("spans", []) or []:
                svc = span.get("svc")
                if svc:
                    # Spans don't carry their own ts; use the trace's ts for bucketing.
                    self.by_service.setdefault(svc, []).append(event_id)

        ts = _parse_ts(event.get("ts", ""))
        if ts:
            bucket = int(ts)
            self.by_bucket.setdefault(bucket, []).append(event_id)

    def ids_in_window(self, t_start: float, t_end: float) -> list[int]:
        """Return event ids whose 1-second bucket falls in [t_start, t_end].

        Bucket-based lookup is O(window_seconds) instead of O(total_events).
        """
        start_b = int(t_start)
        end_b = int(t_end)
        out: list[int] = []
        for b in range(start_b, end_b + 1):
            ids = self.by_bucket.get(b)
            if ids:
                out.extend(ids)
        return out

    def ids_for_service(self, canonical_service: str) -> list[int]:
        return self.by_service.get(canonical_service, [])

    def ids_for_service_id(self, canonical_service_id: int) -> list[int]:
        return self.by_service_id.get(canonical_service_id, [])

    def ids_for_trace(self, trace_id: str) -> list[int]:
        return self.by_trace.get(trace_id, [])

    def ids_for_kind(self, kind: str) -> list[int]:
        return self.by_kind.get(kind, [])

    def ids_for_incident(self, incident_id: str) -> list[int]:
        return self.by_incident.get(incident_id, [])

    def reindex_service(self, old: str, new: str) -> None:
        """Move historical event ids from old service name to new canonical name."""
        if not old or not new or old == new:
            return
        old_ids = self.by_service.pop(old, [])
        if not old_ids:
            return
        merged = sorted(set(self.by_service.get(new, [])) | set(old_ids))
        self.by_service[new] = merged
