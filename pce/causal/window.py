"""Event-window extraction around an incident signal.

Pulls the candidate event set that the chain builder and `related_events`
both work over. Tuned for the two latency budgets (Annex A):
  - fast mode: 5-minute lookback, 30s trailing
  - deep mode: 15-minute lookback, 60s trailing
"""

from pce.store.event_log import _parse_ts


FAST_BEFORE_S = 2400   # 40 min — must be at least WINDOW_BEFORE_S so the
                       # chain builder sees the same events the matcher does
FAST_AFTER_S = 60
DEEP_BEFORE_S = 3600   # 60 min
DEEP_AFTER_S = 120


def get_window(engine, signal_event_id: int, mode: str = "fast") -> tuple[list[int], float]:
    """Return (event_ids, signal_ts) for the window around `signal_event_id`.

    Event ids are sorted by timestamp ascending — the chain builder and
    related_events both rely on this order.
    """
    before, after = (FAST_BEFORE_S, FAST_AFTER_S) if mode == "fast" else (DEEP_BEFORE_S, DEEP_AFTER_S)
    signal_ts = engine.log.ts_of(signal_event_id)
    raw_ids = engine.indices.ids_in_window(signal_ts - before, signal_ts + after)

    # Index may return duplicates (events can land in multiple service buckets
    # for trace spans). Dedupe while preserving temporal order.
    seen: set[int] = set()
    ordered: list[int] = []
    for eid in raw_ids:
        if eid in seen:
            continue
        seen.add(eid)
        ordered.append(eid)
    ordered.sort(key=engine.log.ts_of)
    return ordered, signal_ts
