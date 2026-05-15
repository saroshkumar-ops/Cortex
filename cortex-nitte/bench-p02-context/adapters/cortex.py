"""Bench adapter for the Cortex Persistent Context Engine.

Thin wrapper around `pce.adapter.Engine`. The bench is run from
`bench-p02-context/`, so we add the repo root to sys.path to find the
sibling `pce/` package.
"""
from __future__ import annotations

import os
import sys
from typing import Iterable, Literal

# Make the repo-root `pce/` package importable from inside bench-p02-context/.
# Prefer the current repository root (two levels up); keep a fallback for
# older local layouts where `pce/` might live one level higher.
_THIS = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_THIS, "..", ".."))
if not os.path.isdir(os.path.join(_REPO_ROOT, "pce")):
    _REPO_ROOT = os.path.abspath(os.path.join(_THIS, "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from adapter import Adapter
from schema import Context, Event, IncidentSignal

from pce.adapter import Engine as CortexEngine


class Engine(Adapter):
    """Bench-facing adapter. Per-seed fresh instance, per harness contract."""

    def __init__(self) -> None:
        self._engine = CortexEngine()

    def ingest(self, events: Iterable[Event]) -> None:
        # Convert from generator's `from_` field is unnecessary — the PCE
        # identity resolver already reads either `from_` or `from`.
        self._engine.ingest(events)

    def reconstruct_context(
        self,
        signal: IncidentSignal,
        mode: Literal["fast", "deep"] = "fast",
    ) -> Context:
        # The harness builds the signal as a dict; PCE expects the same.
        return self._engine.reconstruct_context(signal, mode=mode)  # type: ignore[arg-type]

    def close(self) -> None:
        self._engine.close()
