"""Append-only event log with monotonic IDs and parsed-timestamp caching.

Provenance: every event keeps its original payload plus a server-assigned
`event_id` (the in-memory row index). Downstream layers (causal chain,
related_events) reference events by id, so the raw record is the source of
truth and never mutated.
"""

from datetime import datetime, timezone
from typing import Iterable
from pce.schema import Event


def _parse_ts(ts: str) -> float:
    """ISO-8601 → epoch seconds. Tolerates trailing 'Z' and missing tz."""
    if not ts:
        return 0.0
    s = ts.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        # Fallback: assume UTC, drop fractional/timezone tail
        try:
            return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            return 0.0


class EventLog:
    """In-memory append-only log. Events are dicts; ids are list indices."""

    __slots__ = ("_rows", "_ts")

    def __init__(self) -> None:
        self._rows: list[Event] = []
        self._ts: list[float] = []  # parallel array of epoch seconds for fast windowing

    def append(self, event: Event) -> int:
        event_id = len(self._rows)
        # Attach the id back onto the row so reconstruct_context can return it.
        event["event_id"] = event_id
        self._rows.append(event)
        self._ts.append(_parse_ts(event.get("ts", "")))
        return event_id

    def append_many(self, events: Iterable[Event]) -> list[int]:
        return [self.append(e) for e in events]

    def get(self, event_id: int) -> Event:
        return self._rows[event_id]

    def get_many(self, event_ids: Iterable[int]) -> list[Event]:
        return [self._rows[i] for i in event_ids]

    def ts_of(self, event_id: int) -> float:
        return self._ts[event_id]

    def __len__(self) -> int:
        return len(self._rows)

    def all_ids(self) -> range:
        return range(len(self._rows))

    def ids_in_window(self, t_start: float, t_end: float) -> list[int]:
        """Linear scan — good enough for L2 scale (~17k events). Indices layer
        provides faster bucketed lookup; this is the fallback."""
        out = []
        for i, t in enumerate(self._ts):
            if t_start <= t <= t_end:
                out.append(i)
        return out
