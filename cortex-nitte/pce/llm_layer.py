"""LLM-assisted compression, reranking, and explanation layer.

Three independent components, each isolated behind a hard timeout and a
cache, designed to drop in without touching the MinHash+LSH core:

  - LLMWindowSummarizer: ingest-time compression of noisy event windows
    into one operational sentence per fingerprint. Runs in a daemon
    thread so it never blocks the ingest hot path.
  - LLMReranker: recall-time reordering of LSH top-K candidates using
    the cached natural-language summaries.
  - LLMExplainer: end-of-reconstruct narrative generation, with a
    deterministic template fallback.

All three classes are stateless across calls aside from their LRU
caches. They are intended to be instantiated once at Engine startup.
"""

import hashlib
import json
import math
import os
import threading
import urllib.error
import urllib.request
from collections import OrderedDict
from typing import Optional


XAI_API_URL = os.environ.get("XAI_API_URL", "https://api.x.ai/v1/chat/completions")
MODEL = os.environ.get("XAI_MODEL", "grok-2-latest")


def _llm_call(system: str, user: str, max_tokens: int, timeout: float) -> Optional[str]:
    """Single blocking LLM call against the xAI Grok API.

    Uses the OpenAI-compatible chat-completions schema. Returns the text
    content of the first choice, or None on any failure (missing key,
    timeout, non-200, malformed body).
    """
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        return None

    payload = json.dumps({
        "model": MODEL,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }).encode()

    req = urllib.request.Request(
        XAI_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


class _LRUCache:
    """Thread-safe LRU cache using OrderedDict."""

    def __init__(self, maxsize: int):
        self._cache: "OrderedDict[str, str]" = OrderedDict()
        self._maxsize = maxsize
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            return None

    def set(self, key: str, value: str):
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = value
            if len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)


def _hash_key(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def _event_id(ev: dict) -> str:
    eid = ev.get("event_id")
    if eid is not None:
        return str(eid)
    return _hash_key(str(ev.get("ts", "")), str(ev.get("kind", "")), str(ev.get("incident_id", "")))


def _parse_ts_seconds(ts: str) -> float:
    """Very lenient ISO-8601 → seconds. Falls back to 0.0 on failure."""
    if not ts:
        return 0.0
    try:
        from datetime import datetime
        s = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Class 1 — LLMWindowSummarizer
# ---------------------------------------------------------------------------

class LLMWindowSummarizer:
    """Compress a ~25-event ingest window into one operational sentence."""

    def __init__(self, window_size: int = 25, cache_size: int = 2000):
        self.window_size = window_size
        self._cache = _LRUCache(cache_size)

    def should_summarize(self, events: list) -> bool:
        if len(events) < 15:
            return False

        # Anomaly signal 1: any log with level=error/critical
        # Anomaly signal 2: any deploy event
        # Anomaly signal 3: a metric value >2σ from the local mean
        metric_values: list[float] = []
        for ev in events:
            kind = ev.get("kind")
            if kind == "log":
                level = str(ev.get("level", "")).lower()
                if level in ("error", "critical", "fatal"):
                    return True
            elif kind == "deploy":
                return True
            elif kind == "metric":
                v = ev.get("value")
                if isinstance(v, (int, float)):
                    metric_values.append(float(v))

        if len(metric_values) >= 3:
            mean = sum(metric_values) / len(metric_values)
            var = sum((x - mean) ** 2 for x in metric_values) / len(metric_values)
            sigma = math.sqrt(var)
            if sigma > 0:
                for v in metric_values:
                    if abs(v - mean) > 2 * sigma:
                        return True
        return False

    def summarize(self, events: list, canonical_service: str) -> str:
        if not events:
            return ""

        key = _hash_key(*sorted(_event_id(e) for e in events))
        hit = self._cache.get(key)
        if hit is not None:
            return hit

        compact = self._compact_repr(events, canonical_service)
        system = (
            "You are an SRE log summarizer. Respond with exactly one sentence "
            "under 40 words describing what operationally happened. No preamble, "
            "no punctuation variations, just the sentence."
        )
        result = _llm_call(system=system, user=compact, max_tokens=60, timeout=2.0)
        if result is None:
            return ""
        self._cache.set(key, result)
        return result

    # ---- internals ----

    def _compact_repr(self, events: list, canonical_service: str) -> str:
        """Format events as: '[+Xs] KIND service: key_fields'."""
        ordered = sorted(events, key=lambda e: _parse_ts_seconds(e.get("ts", "")))
        t0 = _parse_ts_seconds(ordered[0].get("ts", ""))

        lines: list[str] = [f"SERVICE: {canonical_service or 'unknown'}"]
        for ev in ordered[: self.window_size]:
            offset = int(_parse_ts_seconds(ev.get("ts", "")) - t0)
            kind = ev.get("kind", "event")
            svc = ev.get("service") or ev.get("target") or "?"
            fields = self._key_fields(ev)
            lines.append(f"[+{offset}s] {kind} {svc}: {fields}")
        return "\n".join(lines)

    @staticmethod
    def _key_fields(ev: dict) -> str:
        kind = ev.get("kind")
        if kind == "deploy":
            return f"v?->{ev.get('version', '?')}"
        if kind == "metric":
            return f"{ev.get('name', 'metric')}={ev.get('value', '?')}"
        if kind == "log":
            msg = str(ev.get("msg") or "")[:60]
            return f"{str(ev.get('level','')).upper()} {msg}"
        if kind == "trace":
            spans = ev.get("spans") or []
            return f"{len(spans)} spans"
        if kind == "topology":
            return f"{ev.get('change','change')} -> {ev.get('to','?')}"
        if kind == "incident_signal":
            return f"trigger={ev.get('trigger','?')}"
        return ""


# ---------------------------------------------------------------------------
# Class 2 — LLMReranker
# ---------------------------------------------------------------------------

class LLMReranker:
    """Rerank LSH candidates using natural-language summaries."""

    def __init__(self, cache_size: int = 500):
        self._cache = _LRUCache(cache_size)

    def rerank(
        self,
        current_signal_summary: str,
        current_tokens: set,
        candidates: list,
        top_k: int = 5,
        timeout: float = 1.5,
    ) -> list:
        if not candidates:
            return []
        if not current_signal_summary:
            return candidates[:top_k]
        if all(not getattr(c, "summary", "") and not (isinstance(c, dict) and c.get("summary")) for c in candidates):
            return candidates[:top_k]

        cand_ids = [self._cid(c) for c in candidates]
        key = _hash_key(current_signal_summary, *sorted(cand_ids))
        cached = self._cache.get(key)
        if cached is not None:
            try:
                order = json.loads(cached)
                return self._apply_order(candidates, order, top_k)
            except Exception:
                pass

        prompt = self._build_prompt(current_signal_summary, candidates)
        system = (
            "You are an SRE incident matcher. Service names have been abstracted. "
            "Return only a JSON array, no prose, no markdown fences. Format: "
            "[{\"incident_id\": \"...\", \"rationale\": \"one sentence\"}] for top 5."
        )
        raw = _llm_call(system=system, user=prompt, max_tokens=300, timeout=timeout)
        if not raw:
            return candidates[:top_k]

        try:
            order = json.loads(raw)
            if not isinstance(order, list):
                raise ValueError("expected list")
        except Exception:
            return candidates[:top_k]

        self._cache.set(key, json.dumps(order))
        return self._apply_order(candidates, order, top_k)

    # ---- internals ----

    @staticmethod
    def _cid(c) -> str:
        if isinstance(c, dict):
            return str(c.get("incident_id", ""))
        return str(getattr(c, "incident_id", ""))

    @staticmethod
    def _csim(c) -> float:
        if isinstance(c, dict):
            return float(c.get("similarity", 0.0))
        return float(getattr(c, "similarity", 0.0))

    @staticmethod
    def _csummary(c) -> str:
        if isinstance(c, dict):
            return str(c.get("summary", ""))
        return str(getattr(c, "summary", ""))

    def _build_prompt(self, current_summary: str, candidates: list) -> str:
        lines = ["CURRENT INCIDENT:", current_summary, "", "CANDIDATES:"]
        for i, c in enumerate(candidates, 1):
            cid = self._cid(c)
            sim = self._csim(c)
            summ = self._csummary(c) or "(no summary)"
            lines.append(f"{i}. id={cid} [sim={sim:.2f}] {summ}")
        lines.append("")
        lines.append("Return the top 5 candidates most operationally similar to CURRENT INCIDENT.")
        return "\n".join(lines)

    def _apply_order(self, candidates: list, order: list, top_k: int) -> list:
        by_id = {self._cid(c): c for c in candidates}
        rationales: dict[str, str] = {}
        ranked: list = []
        for item in order:
            if not isinstance(item, dict):
                continue
            cid = str(item.get("incident_id", ""))
            if cid in by_id and cid not in {self._cid(x) for x in ranked}:
                rationales[cid] = str(item.get("rationale", ""))
                ranked.append(by_id[cid])
            if len(ranked) >= top_k:
                break

        # Append any leftovers in original order to fill top_k.
        if len(ranked) < top_k:
            seen = {self._cid(x) for x in ranked}
            for c in candidates:
                if self._cid(c) not in seen:
                    ranked.append(c)
                    if len(ranked) >= top_k:
                        break

        # Attach rationale to each item (dict or object).
        for c in ranked:
            cid = self._cid(c)
            r = rationales.get(cid)
            if not r:
                continue
            if isinstance(c, dict):
                c["rationale"] = r
            else:
                try:
                    setattr(c, "rationale", r)
                except Exception:
                    pass
        return ranked[:top_k]


# ---------------------------------------------------------------------------
# Class 3 — LLMExplainer
# ---------------------------------------------------------------------------

class LLMExplainer:
    """Generate a three-paragraph on-call-ready narrative, with a template fallback."""

    def __init__(self, cache_size: int = 200):
        self._cache = _LRUCache(cache_size)

    def explain(
        self,
        signal,
        causal_chain: list,
        similar_incidents: list,
        suggested_remediations: list,
        confidence: float,
        timeout: float = 4.0,
    ) -> str:
        inc_id = (signal or {}).get("incident_id", "?")
        top_sim_id = ""
        if similar_incidents:
            top = similar_incidents[0]
            top_sim_id = top.get("incident_id", "") if isinstance(top, dict) else getattr(top, "incident_id", "")
        top_rem = ""
        if suggested_remediations:
            r0 = suggested_remediations[0]
            top_rem = r0.get("action", "") if isinstance(r0, dict) else getattr(r0, "action", "")

        key = _hash_key(str(inc_id), str(top_sim_id), str(top_rem))
        hit = self._cache.get(key)
        if hit is not None:
            return hit

        compact = self._compact_inputs(signal, causal_chain, similar_incidents, suggested_remediations, confidence)
        system = (
            "You are writing a concise incident summary for an on-call SRE engineer "
            "who needs to act in the next 5 minutes. Be specific: name services, "
            "versions, and actions. Three paragraphs, 120-160 words total. "
            "No bullet points, no headers."
        )
        result = _llm_call(system=system, user=compact, max_tokens=250, timeout=timeout)
        if not result:
            return self._fallback_explain(signal, causal_chain, similar_incidents, suggested_remediations, confidence)
        self._cache.set(key, result)
        return result

    def _fallback_explain(
        self,
        signal,
        causal_chain: list,
        similar_incidents: list,
        suggested_remediations: list,
        confidence: float,
    ) -> str:
        inc_id = (signal or {}).get("incident_id", "?")
        svc = (signal or {}).get("service") or (signal or {}).get("trigger") or "service"
        n_edges = len(causal_chain or [])
        past_id = "no prior match"
        if similar_incidents:
            top = similar_incidents[0]
            past_id = top.get("incident_id", "?") if isinstance(top, dict) else getattr(top, "incident_id", "?")
        action = "no remediation suggested"
        target = "?"
        if suggested_remediations:
            r0 = suggested_remediations[0]
            if isinstance(r0, dict):
                action = r0.get("action", action)
                target = r0.get("target", target)
            else:
                action = getattr(r0, "action", action)
                target = getattr(r0, "target", target)
        return (
            f"Incident {inc_id} on {svc}: {n_edges} causal edges detected. "
            f"Most similar to {past_id}. Recommended: {action} on {target}. "
            f"Confidence: {confidence:.0%}."
        )

    # ---- internals ----

    @staticmethod
    def _compact_inputs(signal, causal_chain, similar_incidents, suggested_remediations, confidence) -> str:
        sig = signal or {}
        svc = sig.get("service") or "?"
        trigger = sig.get("trigger") or "?"
        ts = sig.get("ts") or "?"

        lines = [f"INCIDENT: {svc} triggered {trigger} at {ts}"]

        if causal_chain:
            edges = []
            for e in causal_chain[:6]:
                cause = e.get("cause_event_id", "?")
                effect = e.get("effect_event_id", "?")
                conf = e.get("confidence", 0.0)
                edges.append(f"{cause} -> {effect} (conf={conf:.2f})")
            lines.append("CAUSAL CHAIN: " + " | ".join(edges))
        else:
            lines.append("CAUSAL CHAIN: (none)")

        if similar_incidents:
            sims = []
            for m in similar_incidents[:5]:
                if isinstance(m, dict):
                    mid = m.get("incident_id", "?")
                    msim = m.get("similarity", 0.0)
                    mrat = m.get("rationale", "")
                else:
                    mid = getattr(m, "incident_id", "?")
                    msim = getattr(m, "similarity", 0.0)
                    mrat = getattr(m, "rationale", "")
                sims.append(f"{mid} sim={msim:.2f}: {mrat}")
            lines.append("SIMILAR PAST: " + " | ".join(sims))
        else:
            lines.append("SIMILAR PAST: (none)")

        if suggested_remediations:
            r0 = suggested_remediations[0]
            if isinstance(r0, dict):
                action = r0.get("action", "?")
                target = r0.get("target", "?")
                rconf = r0.get("confidence", 0.0)
            else:
                action = getattr(r0, "action", "?")
                target = getattr(r0, "target", "?")
                rconf = getattr(r0, "confidence", 0.0)
            lines.append(f"BEST REMEDIATION: {action} on {target}, historical success={rconf*100:.0f}%")
        else:
            lines.append("BEST REMEDIATION: (none)")

        lines.append(f"CONFIDENCE: {confidence:.2f}")
        lines.append("")
        lines.append(
            "Write three paragraphs: (1) what happened and why using the causal chain, "
            "(2) whether this matches a past pattern, (3) recommended action with "
            "confidence reasoning. 120-160 words, specific service names and versions, no filler."
        )
        return "\n".join(lines)
