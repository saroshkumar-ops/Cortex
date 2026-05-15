"""Behavioral abstraction — incident window → role-token multiset.

The rename-robustness story lives here. Tokens deliberately drop service
*names* and encode only *roles* relative to the incident signal:

  - role 'self'  : the event's canonical service == signal's canonical service
  - role 'peer'  : any other service
  - relative time is bucketed (coarse), not absolute
  - metric values are bucketed into low/mid/high tiers

A `payments-svc -> billing-svc` rename leaves tokens unchanged: identity
resolution runs at ingest time, so any historical 'payments-svc' event is
already filed under 'billing-svc'. The matcher therefore compares
*behaviors*, not names.
"""

import re
from typing import Iterable
from pce.schema import Event


# Relative-time buckets (seconds before the signal). Anything beyond
# WINDOW_BEFORE_S is dropped. Anything after the signal up to WINDOW_AFTER_S
# is bucketed as 'post'.
WINDOW_BEFORE_S = 2400  # 40 min lookback — the bench generator places the
                        # incident's triggering deploy at T-30min, so 40 min
                        # gives us comfortable headroom.
WINDOW_AFTER_S = 60     # 1 min trailing (for late-arriving telemetry)

_TIME_BUCKETS_BEFORE = [
    (30, "0-30s"),
    (180, "30-180s"),
    (900, "180-900s"),
    (2400, "900-2400s"),
]

# Metric severity tiers. Coarse on purpose — we want behavioral matching,
# not numeric retrieval.
_METRIC_TIERS = {
    # name fragment -> (low_thresh, high_thresh)
    "latency": (200.0, 1000.0),
    "error_rate": (0.01, 0.05),
    "cpu": (60.0, 85.0),
    "memory": (60.0, 85.0),
    "request_rate": (10.0, 200.0),
}


_TRIGGER_SVC_RE = re.compile(r"[:\s]([\w][\w\-\.]*)/")


def extract_signal_service(signal: Event) -> str | None:
    """Pull the affected service name out of a signal event.

    The bench's IncidentSignal carries an explicit `service` field — prefer
    that. Fall back to parsing the trigger string for compatibility with
    fixtures that omit the service field.
    """
    explicit = signal.get("service")
    if explicit:
        return explicit
    trigger = signal.get("trigger") or ""
    if "/" not in trigger:
        return None
    m = _TRIGGER_SVC_RE.search(trigger)
    if m:
        return m.group(1)
    try:
        return trigger.split(":", 1)[1].split("/", 1)[0].strip()
    except (IndexError, AttributeError):
        return None


def _time_bucket(dt: float) -> str | None:
    """Map a signed delta-seconds-from-signal to a fine bucket label."""
    if dt > WINDOW_AFTER_S:
        return None
    if dt > 0:
        return "post"
    abs_dt = -dt
    if abs_dt > WINDOW_BEFORE_S:
        return None
    for thresh, label in _TIME_BUCKETS_BEFORE:
        if abs_dt <= thresh:
            return label
    return "900-2400s"  # fallback within WINDOW_BEFORE_S


def _coarse_bucket(dt: float) -> str | None:
    """Map a delta to a coarse bucket. Used in parallel with the fine bucket
    so two incidents in the same family still share *some* tokens even when
    their timing differs (one fires 90s after deploy, another 600s after)."""
    if dt > WINDOW_AFTER_S:
        return None
    if dt > 0:
        return "post"
    abs_dt = -dt
    if abs_dt > WINDOW_BEFORE_S:
        return None
    return "pre"


def _metric_tier(name: str, value: float) -> str:
    """Bucket a metric value into low/mid/high based on its name."""
    name_lower = (name or "").lower()
    for frag, (lo, hi) in _METRIC_TIERS.items():
        if frag in name_lower:
            if value < lo:
                return "low"
            if value < hi:
                return "mid"
            return "high"
    # Unknown metric — use a single 'any' tier rather than fail
    return "any"


def build_tokens(engine, incident_id: str) -> tuple[set[str], dict]:
    """Build the role-token multiset for an incident.

    Returns (tokens, meta) where meta carries:
      - signal_event_id
      - signal_ts (epoch)
      - canonical_service (of the signal, or None)
      - window_event_ids (list of event ids included in the window)
    """
    inc_ids = engine.indices.ids_for_incident(incident_id)
    if not inc_ids:
        return set(), {"signal_event_id": None, "canonical_service": None}

    # First incident event is the signal; later ones are remediation(s).
    signal_event_id = inc_ids[0]
    signal = engine.log.get(signal_event_id)
    signal_ts = engine.log.ts_of(signal_event_id)

    raw_svc = extract_signal_service(signal)
    canonical_svc = engine.identity.canonical(raw_svc, signal.get("ts")) if raw_svc else None

    t_start = signal_ts - WINDOW_BEFORE_S
    t_end = signal_ts + WINDOW_AFTER_S
    window_ids = engine.indices.ids_in_window(t_start, t_end)

    tokens: set[str] = set()
    included: list[int] = []

    for eid in window_ids:
        ev = engine.log.get(eid)
        kind = ev.get("kind", "")
        if kind == "incident_signal":
            continue  # don't tokenize the signal itself; it's the anchor

        dt = engine.log.ts_of(eid) - signal_ts
        bucket = _time_bucket(dt)
        coarse = _coarse_bucket(dt)
        if bucket is None and coarse is None:
            continue

        # Resolve every service mention to its canonical name, then to a role.
        ev_svc_raw = ev.get("service") or ev.get("target")
        ev_canonical = engine.identity.canonical(ev_svc_raw, ev.get("ts")) if ev_svc_raw else None
        role = _role(ev_canonical, canonical_svc)

        # Emit each token at two time scales: fine bucket and coarse
        # ("pre"/"post"). Same-family incidents that fire at different latencies
        # (e.g. 90s after deploy vs. 600s after deploy) will still share the
        # coarse tokens.
        time_labels = [b for b in (bucket, coarse) if b is not None]

        if kind == "deploy":
            for b in time_labels:
                tokens.add(f"deploy:{role}:{b}")
            ver = ev.get("version") or ""
            if ver:
                for b in time_labels:
                    tokens.add(f"deploy_versioned:{role}:{b}")
        elif kind == "log":
            lvl = (ev.get("level") or "").lower()
            # Prefer the template-based token (parameter-invariant: two logs
            # like "timeout calling X (req_id=abc)" and "...(req_id=def)" land
            # on the same template_id and therefore the same token). Falls
            # back to log:{level} for events ingested before templating
            # existed, or for empty-msg logs.
            template_id = ev.get("template_id")
            if template_id is not None and template_id >= 0:
                for b in time_labels:
                    tokens.add(f"log_template:{template_id}:{role}:{b}")
                if lvl:
                    for b in time_labels:
                        tokens.add(f"log_level:{lvl}:{role}:{b}")
            else:
                for b in time_labels:
                    tokens.add(f"log:{lvl or 'any'}:{role}:{b}")
            # Cross-service error mentions are a strong signal of cascade —
            # extract any service-like substring from the message and check
            # whether it differs from the log's own service. Done on raw msg
            # since service names are template *parameters*, not the structural
            # pattern, and we want the resolved canonical name.
            if lvl == "error":
                msg = ev.get("msg") or ""
                for name_match in re.findall(r"[a-z][a-z0-9\-]+(?:-svc|-api|-service)", msg):
                    other_canonical = engine.identity.canonical(name_match, ev.get("ts"))
                    if other_canonical and other_canonical != ev_canonical:
                        for b in time_labels:
                            tokens.add(f"cross_service_error:{role}:{b}")
                        break
        elif kind == "metric":
            tier = _metric_tier(ev.get("name", ""), float(ev.get("value", 0.0) or 0.0))
            family = _metric_family(ev.get("name", ""))
            for b in time_labels:
                tokens.add(f"metric:{family}:{tier}:{role}:{b}")
        elif kind == "trace":
            spans = ev.get("spans") or []
            fanout = len(spans)
            if fanout > 0:
                fanout_bucket = "1" if fanout == 1 else ("2-3" if fanout <= 3 else "4+")
                for b in time_labels:
                    tokens.add(f"trace:fanout={fanout_bucket}:{b}")
            for sp in spans:
                sp_canonical = engine.identity.canonical(sp.get("svc"), ev.get("ts"))
                if sp_canonical == canonical_svc and canonical_svc:
                    for b in time_labels:
                        tokens.add(f"trace_touches_self:{b}")
                    break
        elif kind == "topology":
            for b in time_labels:
                tokens.add(f"topology:{ev.get('change', 'any')}:{b}")
        elif kind == "remediation":
            for b in time_labels:
                tokens.add(f"prior_remediation:{ev.get('action', 'any')}:{role}:{b}")

        included.append(eid)

    return tokens, {
        "signal_event_id": signal_event_id,
        "signal_ts": signal_ts,
        "canonical_service": canonical_svc,
        "window_event_ids": included,
    }


def _role(event_canonical: str | None, signal_canonical: str | None) -> str:
    if not event_canonical or not signal_canonical:
        return "unknown"
    return "self" if event_canonical == signal_canonical else "peer"


def _metric_family(name: str) -> str:
    """Collapse specific metric names like 'latency_p99_ms' to a family."""
    name_lower = (name or "").lower()
    for frag in ("latency", "error_rate", "cpu", "memory", "request_rate"):
        if frag in name_lower:
            return frag
    return "other"
