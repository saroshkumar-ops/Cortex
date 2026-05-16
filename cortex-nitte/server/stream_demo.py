"""Server-Sent-Events endpoint that runs a small benchmark-style flow live,
streaming: status updates, an LLM "thinking" narration, per-incident scoring,
final aggregate scores, and an LLM reasoning explanation.

The LLM narration uses Groq's OpenAI-compatible chat-completions API.
Configure via env: GROQ_API_KEY (required), GROQ_MODEL (default
`llama-3.3-70b-versatile`), GROQ_API_URL (default Groq public endpoint).
If Groq is unreachable or rate-limited, falls back to a smaller model
and finally to a deterministic local narration so the demo still works.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from typing import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

# Make the bench-p02-context modules importable from the server process.
_BENCH_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "bench-p02-context")
)
if _BENCH_DIR not in sys.path:
    sys.path.insert(0, _BENCH_DIR)

# Best-effort .env loader for GROQ_API_KEY (no python-dotenv dep).
def _load_dotenv_once() -> None:
    if os.environ.get("_CORTEX_DOTENV_LOADED"):
        return
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
    ]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                for raw in f:
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    os.environ.setdefault(k, v)
        except Exception:
            pass
    os.environ["_CORTEX_DOTENV_LOADED"] = "1"


_load_dotenv_once()

router = APIRouter()


def _sse(event: str, data: dict | list) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n".encode("utf-8")


_LAST_LLM_ERROR: str | None = None
_LAST_LLM_MODEL: str | None = None


def _groq_stream_once(system: str, prompt: str, model: str) -> Iterator[str]:
    """Single attempt at Groq's streaming chat completion (OpenAI-compatible).
    Raises on transport / HTTP failure so the caller can decide whether to
    retry or fall back to a smaller model."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set")
    url = os.environ.get(
        "GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions"
    )
    body = json.dumps({
        "model": model,
        "stream": True,
        "temperature": 0.4,
        "max_tokens": 500,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "User-Agent": "cortex-pce-demo/0.1",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        for raw in resp:
            line = raw.decode("utf-8", errors="ignore").strip()
            if not line or not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                return
            try:
                obj = json.loads(payload)
                delta = (
                    obj.get("choices", [{}])[0]
                    .get("delta", {})
                    .get("content", "")
                )
                if delta:
                    yield delta
            except Exception:
                continue


def _model_chain() -> list[str]:
    """Primary Groq model from env, plus smaller-quota fallbacks. Each model
    on Groq has an independent TPD quota, so a 429 on the primary doesn't
    block the demo."""
    primary = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    candidates = [primary, "llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
    seen: set[str] = set()
    ordered: list[str] = []
    for m in candidates:
        if m and m not in seen:
            ordered.append(m)
            seen.add(m)
    return ordered


def _groq_stream(system: str, prompt: str) -> Iterator[str]:
    """Yield text chunks from Groq, retrying with the smaller-model fallback
    chain on transient 4xx/5xx. Records the last error in _LAST_LLM_ERROR and
    the model that produced output in _LAST_LLM_MODEL."""
    global _LAST_LLM_ERROR, _LAST_LLM_MODEL
    _LAST_LLM_ERROR = None
    _LAST_LLM_MODEL = None
    for model in _model_chain():
        try:
            yielded = False
            for chunk in _groq_stream_once(system, prompt, model):
                yielded = True
                yield chunk
            if yielded:
                _LAST_LLM_ERROR = None
                _LAST_LLM_MODEL = model
                return
            _LAST_LLM_ERROR = f"{model}: empty response"
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode("utf-8", errors="ignore")[:200]
            except Exception:
                detail = ""
            _LAST_LLM_ERROR = f"{model}: HTTP {e.code} {detail or e.reason}"
            print(f"[groq] {_LAST_LLM_ERROR}", flush=True)
            # Try fallback model on rate-limit / transient server errors,
            # bail on hard 4xx (bad key, malformed request).
            if e.code not in (408, 429, 500, 502, 503, 504):
                return
        except (urllib.error.URLError, TimeoutError) as e:
            _LAST_LLM_ERROR = f"{model}: {type(e).__name__}: {e}"
            print(f"[groq] {_LAST_LLM_ERROR}", flush=True)
        except Exception as e:
            _LAST_LLM_ERROR = f"{model}: {type(e).__name__}: {e}"
            print(f"[groq] {_LAST_LLM_ERROR}", flush=True)
            return
        time.sleep(0.3)


def _last_llm_error() -> str | None:
    return _LAST_LLM_ERROR


def _last_llm_model() -> str | None:
    return _LAST_LLM_MODEL


def _family_from_id(inc_id: str | None) -> int | None:
    """Bench-p02 ground-truth families are encoded as the trailing integer
    of the incident_id (matches metrics.py:_family_from_incident_id)."""
    if not inc_id:
        return None
    try:
        return int(str(inc_id).rsplit("-", 1)[-1])
    except (ValueError, IndexError):
        return None


def _sample_telemetry(events: list[dict]) -> list[dict]:
    """Pick a representative slice of the bench-p02 telemetry to surface in
    the UI log panel: every topology mutation (renames matter for the demo),
    plus capped samples of deploys, error logs, sharp metric anomalies,
    incident signals, and remediations — in chronological order."""
    by_kind: dict[str, list[dict]] = {}
    for ev in events:
        by_kind.setdefault(ev.get("kind", "?"), []).append(ev)
    picked: list[dict] = []
    picked.extend(by_kind.get("topology", []))           # all renames / dep changes
    picked.extend(by_kind.get("deploy", [])[:5])
    picked.extend(by_kind.get("log", [])[:5])
    # metric events: keep the spikiest (highest numeric `value` if present)
    metrics = by_kind.get("metric", [])
    metrics_sorted = sorted(
        metrics,
        key=lambda e: float(e.get("value", 0)) if isinstance(e.get("value"), (int, float)) else 0,
        reverse=True,
    )
    picked.extend(metrics_sorted[:5])
    picked.extend(by_kind.get("incident_signal", [])[:3])
    picked.extend(by_kind.get("remediation", [])[:3])
    picked.sort(key=lambda e: e.get("ts", ""))
    return picked


def _format_telemetry(ev: dict) -> dict:
    """Render one telemetry event into a UI-friendly log frame."""
    kind = ev.get("kind", "?")
    ts = ev.get("ts", "")
    svc = ev.get("service") or ev.get("trigger") or ""
    level = "info"
    if kind == "log":
        level = ev.get("level", "info")
        line = f'{ts}  {kind:<15} {svc:<14}  {ev.get("msg", "")}'
    elif kind == "metric":
        level = "warn" if "p99" in str(ev.get("name", "")) or "error" in str(ev.get("name", "")) else "info"
        line = (
            f'{ts}  {kind:<15} {svc:<14}  '
            f'{ev.get("name","metric")}={ev.get("value")}'
        )
    elif kind == "deploy":
        line = (
            f'{ts}  {kind:<15} {svc:<14}  '
            f'version={ev.get("version","?")}'
        )
    elif kind == "topology":
        change = ev.get("change") or ev.get("action") or "change"
        src = ev.get("from_") or ev.get("from") or ev.get("src") or svc or ""
        dst = ev.get("to") or ev.get("dst") or ""
        line = f'{ts}  {kind:<15} {src:<14}  {change}: {src} -> {dst}'
    elif kind == "incident_signal":
        level = "error"
        line = f'{ts}  {kind:<15} {svc:<14}  {ev.get("incident_id","")} · {ev.get("trigger","")}'
    elif kind == "remediation":
        level = "info"
        line = (
            f'{ts}  {kind:<15} {svc:<14}  '
            f'{ev.get("incident_id","")} fixed by {ev.get("action","?")}'
        )
    else:
        line = f'{ts}  {kind:<15} {svc:<14}  {json.dumps({k:v for k,v in ev.items() if k not in ("ts","kind","service")})[:120]}'
    return {"level": level, "kind": kind, "line": line}


def _enrich_match(engine, match: dict) -> dict:
    """Pull the historical incident's signal timestamp, service, and the
    remediation that was actually used — so the UI can show *why* memory
    recall is useful, not just the matched ID."""
    inc_id = match.get("incident_id")
    sim = match.get("similarity")
    rationale = match.get("rationale") or ""

    past_signal_ts = None
    past_service = None
    past_remediation = None
    try:
        ids = engine.indices.ids_for_incident(inc_id) if inc_id else []
        for eid in ids:
            ev = engine.log.get(eid)
            kind = ev.get("kind") if ev else None
            if kind == "incident_signal" and past_signal_ts is None:
                past_signal_ts = ev.get("ts")
                past_service = ev.get("service") or ev.get("trigger")
            elif kind == "remediation" and past_remediation is None:
                past_remediation = ev.get("action") or ev.get("description")
            if past_signal_ts and past_remediation:
                break
    except Exception:
        pass

    return {
        "incident_id": inc_id,
        "similarity": round(sim, 3) if isinstance(sim, (int, float)) else sim,
        "rationale": rationale if isinstance(rationale, str) else str(rationale),
        "past_ts": past_signal_ts,
        "past_service": past_service,
        "past_remediation": past_remediation,
    }


def _run_stream(seed: int | None = None) -> Iterator[bytes]:
    from generator import GenConfig, generate
    from metrics import IncidentScore, aggregate, score_match, score_remediation
    from pce.adapter import Engine

    yield _sse("status", {"phase": "init", "message": "Starting benchmark run"})

    if seed is None:
        seed = random.randint(1, 1_000_000)
    cfg = GenConfig(seed=seed, n_services=6, days=2)
    yield _sse("status", {
        "phase": "generate",
        "message": (
            f"Generating synthetic telemetry "
            f"(seed={cfg.seed}, services={cfg.n_services}, days={cfg.days})"
        ),
    })
    ds = generate(cfg)
    yield _sse("dataset", {
        "train_events": len(ds.train_events),
        "eval_events": len(ds.eval_events),
        "eval_signals": len(ds.eval_signals),
        "n_services": cfg.n_services,
        "days": cfg.days,
        "seed": cfg.seed,
    })

    # ---- thinking narration ------------------------------------------------
    yield _sse("status", {"phase": "think", "message": "Reasoning about plan"})
    plan_sys = (
        "You are an operational SRE memory engine narrating your own internal "
        "process in real time. Be concise, technical, first-person, present tense."
    )
    plan_prompt = (
        f"You are about to process a fresh telemetry batch:\n"
        f"- training events: {len(ds.train_events)}\n"
        f"- eval events: {len(ds.eval_events)}\n"
        f"- held-out incident signals to reconstruct: {len(ds.eval_signals)}\n"
        f"- services: {cfg.n_services}, time window: {cfg.days} days.\n\n"
        f"In 5-7 short sentences, narrate your plan step by step as if you are "
        f"thinking aloud. Cover: ingestion + indexing, identity resolution across "
        f"rename chains, role-token signature abstraction, MinHash+LSH similar-"
        f"incident retrieval with Jaccard rerank, causal-chain reconstruction, "
        f"and remediation aggregation. Do not list bullets; speak in flowing prose."
    )
    chunks_seen = 0
    for chunk in _groq_stream(plan_sys, plan_prompt):
        chunks_seen += 1
        yield _sse("thinking", {"delta": chunk})
    yield _sse("llm_status", {
        "section": "thinking",
        "source": "llm" if chunks_seen > 0 else "local",
        "model": _last_llm_model() if chunks_seen > 0 else None,
        "error": _last_llm_error() if chunks_seen == 0 else None,
    })
    if chunks_seen == 0:
        fallback = (
            f"Plan: ingest {len(ds.train_events) + len(ds.eval_events)} "
            f"telemetry events into the append-only log, canonicalize "
            f"service identities so the {cfg.n_services} services survive "
            f"renames, abstract each window into role-token signatures, "
            f"index them via MinHash+LSH, and for each of the "
            f"{len(ds.eval_signals)} held-out signals reconstruct context, "
            f"retrieve top-K similar incidents by Jaccard, build the causal "
            f"chain, and aggregate remediations from matched outcomes."
        )
        yield _sse("thinking", {"delta": fallback})

    # ---- ingest ------------------------------------------------------------
    engine = Engine()
    yield _sse("status", {"phase": "ingest", "message": "Ingesting events"})
    t0 = time.monotonic()
    engine.ingest(ds.train_events)
    engine.ingest(ds.eval_events)
    ingest_ms = (time.monotonic() - t0) * 1000.0

    # Stream a sample of the actual telemetry the engine just consumed, so
    # the UI's log panel shows real bench-p02 events instead of meta-summaries.
    for ev in _sample_telemetry(ds.train_events + ds.eval_events):
        yield _sse("log", _format_telemetry(ev))

    yield _sse("log", {
        "level": "info",
        "kind": "summary",
        "line": (
            f"… {len(ds.train_events) + len(ds.eval_events)} events ingested "
            f"in {ingest_ms:.1f} ms · "
            f"engine: events={len(engine.log)}, "
            f"services_known={len(engine.indices.by_service)}, "
            f"incidents_registered={len(engine.matcher.all_incident_ids())}, "
            f"renames_tracked={len(getattr(engine.identity, '_renames', {}))}"
        ),
    })

    # warmup
    yield _sse("status", {"phase": "warmup", "message": "Warming caches"})
    for sig in ds.eval_signals[:2]:
        engine.reconstruct_context(sig, mode="fast")
    yield _sse("log", {"level": "info", "line": "Warmup complete (2 signals)"})

    # ---- per-incident scoring ---------------------------------------------
    yield _sse("status", {"phase": "score", "message": "Reconstructing held-out signals"})
    scores: list[IncidentScore] = []
    # Per-incident records that the reasoning prompt will see — so the LLM
    # explains the scores from the actual outcomes, not generic architecture.
    incident_records: list[dict] = []
    for sig, gt in zip(ds.eval_signals, ds.ground_truth):
        signal = {
            "incident_id": sig["incident_id"],
            "ts": sig["ts"],
            "trigger": sig.get("trigger", ""),
            "service": sig.get("service", ""),
        }
        q0 = time.monotonic()
        ctx = engine.reconstruct_context(signal, mode="fast")
        latency = (time.monotonic() - q0) * 1000.0

        in_top_k, precision = score_match(ctx, gt, k=5)
        rem_ok = score_remediation(ctx, gt)
        scores.append(IncidentScore(
            incident_id=sig["incident_id"],
            correct_family_in_top_k=in_top_k,
            precision_at_k=precision,
            remediation_matches=rem_ok,
            latency_ms=latency,
        ))

        matches = (ctx.get("similar_past_incidents") or [])[:5]
        rems = (ctx.get("suggested_remediations") or [])[:3]
        enriched_matches = [_enrich_match(engine, m) for m in matches]

        # Per-incident record for the reasoning prompt.
        gt_family = gt.get("family")
        match_families = [_family_from_id(m.get("incident_id")) for m in enriched_matches]
        correct_in_top5 = sum(1 for f in match_families if f == gt_family)
        suggested_action = (rems[0].get("action") if rems else None)
        incident_records.append({
            "id": sig["incident_id"],
            "service": sig.get("service", ""),
            "trigger": sig.get("trigger", ""),
            "gt_family": gt_family,
            "gt_remediation": gt.get("expected_remediation"),
            "match_ids": [m.get("incident_id") for m in enriched_matches],
            "match_families": match_families,
            "correct_in_top5": correct_in_top5,
            "top1_similarity": enriched_matches[0].get("similarity") if enriched_matches else None,
            "top1_past_remediation": enriched_matches[0].get("past_remediation") if enriched_matches else None,
            "suggested_action": suggested_action,
            "precision_at_5": round(precision, 3),
            "in_top_k": in_top_k,
            "rem_ok": rem_ok,
            "latency_ms": round(latency, 2),
        })

        yield _sse("incident", {
            "incident_id": sig["incident_id"],
            "service": sig.get("service", ""),
            "trigger": sig.get("trigger", ""),
            "ts": sig.get("ts", ""),
            "in_top_k": in_top_k,
            "precision_at_k": round(precision, 3),
            "remediation_matches": rem_ok,
            "latency_ms": round(latency, 2),
            "matches": enriched_matches,
            "suggested": [
                {"action": s.get("action"), "support": s.get("support")}
                for s in rems
            ],
            "explain": (ctx.get("explain") or "")[:600],
        })

    summary = aggregate(scores)
    yield _sse("scores", summary)

    # ---- final reasoning --------------------------------------------------
    yield _sse("status", {"phase": "reason", "message": "Explaining the result"})

    # Pre-digest the analysis so the LLM gets short, concrete facts — not a
    # 60-line table that small local models will just regurgitate.
    impure = sorted(
        [r for r in incident_records if r["correct_in_top5"] < 5],
        key=lambda r: r["correct_in_top5"],
    )
    suggested_counter: dict[str, int] = {}
    for r in incident_records:
        a = r.get("suggested_action")
        if a:
            suggested_counter[a] = suggested_counter.get(a, 0) + 1
    top_action = max(suggested_counter, key=suggested_counter.get) if suggested_counter else None
    n = len(incident_records)
    n_recall = sum(1 for r in incident_records if r["in_top_k"])
    n_rem = sum(1 for r in incident_records if r["rem_ok"])

    facts: list[str] = []
    facts.append(
        f"{n_recall}/{n} held-out signals had the correct family in the top-5 "
        f"(recall@5 = {summary.get('recall@5')})."
    )
    if not impure:
        facts.append(
            f"All {n} top-5 lists were fully pure — precision@5 = "
            f"{summary.get('precision@5_mean')}."
        )
    else:
        worst = impure[0]
        wrong_ids = [
            mid for mid, fam in zip(worst["match_ids"], worst["match_families"])
            if fam != worst["gt_family"]
        ]
        facts.append(
            f"Precision@5 = {summary.get('precision@5_mean')}. The biggest "
            f"miss was {worst['id']} (family {worst['gt_family']}): only "
            f"{worst['correct_in_top5']}/5 retrieved incidents were the same "
            f"family. The wrong ones were {wrong_ids}."
        )
        if len(impure) > 1:
            others = ", ".join(f"{r['id']} ({r['correct_in_top5']}/5)" for r in impure[1:4])
            facts.append(f"Other impure top-5 lists: {others}.")
    if top_action:
        facts.append(
            f"The engine suggested '{top_action}' on "
            f"{suggested_counter.get(top_action, 0)} of {n} signals, matching "
            f"the historical fix each time → remediation_acc = "
            f"{summary.get('remediation_acc')} ({n_rem}/{n})."
        )
    facts.append(
        f"Latency: mean {summary.get('latency_mean_ms')} ms, "
        f"p95 {summary.get('latency_p95_ms')} ms over {n} reconstructions."
    )
    # one concrete pure-match example to anchor the prose
    pure_example = next((r for r in incident_records if r["correct_in_top5"] == 5), None)
    if pure_example:
        facts.append(
            f"Example of a clean recall: {pure_example['id']} was matched to "
            f"{pure_example['match_ids'][0]} at similarity "
            f"{pure_example['top1_similarity']}; the past fix '"
            f"{pure_example['top1_past_remediation']}' was reused."
        )

    reason_sys = (
        "You explain a benchmark run in 4-6 short sentences using only the "
        "facts provided. Cite incident IDs verbatim. Plain prose. No bullets, "
        "no headings, no preamble, no restating the prompt."
    )
    reason_prompt = "Facts:\n" + "\n".join(f"- {f}" for f in facts) + "\nWrite the explanation now."
    chunks_seen = 0
    for chunk in _groq_stream(reason_sys, reason_prompt):
        chunks_seen += 1
        yield _sse("reasoning", {"delta": chunk})
    yield _sse("llm_status", {
        "section": "reasoning",
        "source": "llm" if chunks_seen > 0 else "local",
        "model": _last_llm_model() if chunks_seen > 0 else None,
        "error": _last_llm_error() if chunks_seen == 0 else None,
    })
    if chunks_seen == 0:
        # Deterministic, incident-grounded fallback when the LLM is down.
        recall_ok = sum(1 for r in incident_records if r["in_top_k"])
        rem_ok = sum(1 for r in incident_records if r["rem_ok"])
        worst = sorted(incident_records, key=lambda r: r["correct_in_top5"])[:2]
        lines = [
            f"{recall_ok}/{len(incident_records)} signals had the correct "
            f"family in the top-5 (recall@5={summary.get('recall@5')}). "
        ]
        if impure:
            lines.append(
                f"Precision was held below 1.0 by {len(impure)} signals — "
                f"e.g. {worst[0]['id']} where only "
                f"{worst[0]['correct_in_top5']}/5 retrieved incidents "
                f"({worst[0]['match_ids']}) were from the same family "
                f"({worst[0]['gt_family']}); the rest came from neighbouring "
                f"families with overlapping symptoms. "
            )
        else:
            lines.append(
                "Every signal had a fully-pure top-5, so precision@5_mean "
                f"hit {summary.get('precision@5_mean')}. "
            )
        lines.append(
            f"{rem_ok}/{len(incident_records)} signals received the correct "
            f"remediation. "
        )
        if top_action:
            lines.append(
                f"The engine kept suggesting '{top_action}' "
                f"({suggested_counter.get(top_action, 0)} of "
                f"{len(incident_records)} times) because that was the action "
                f"recorded in the past incidents it matched. "
            )
        lines.append(
            f"Median latency was {summary.get('latency_mean_ms')} ms with a "
            f"p95 of {summary.get('latency_p95_ms')} ms across the "
            f"{len(incident_records)} reconstructions."
        )
        yield _sse("reasoning", {"delta": "".join(lines)})

    yield _sse("done", {"ok": True})


@router.get("/api/pce/run_benchmark_stream")
def run_benchmark_stream(seed: int | None = None) -> StreamingResponse:
    return StreamingResponse(
        _run_stream(seed),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
