"""Bench adapter for the Cortex PCE engine living in the local workspace."""
from __future__ import annotations

import os
import sys
from typing import Iterable, Literal

from adapter import Adapter
from schema import Context, Event, IncidentSignal

# Make the cortex-nitte repo (with pce/) importable from this harness.
_THIS = os.path.dirname(os.path.abspath(__file__))
_PCE_ROOT = os.path.abspath(os.path.join(_THIS, "..", "..", "..", "cortex-nitte"))
if _PCE_ROOT not in sys.path:
    sys.path.insert(0, _PCE_ROOT)

from pce.adapter import Engine as PCEEngine


class Engine(Adapter):
    """Bench-facing adapter."""

    def __init__(self) -> None:
        self._engine = PCEEngine()

    def ingest(self, events: Iterable[Event]) -> None:
        self._engine.ingest(events)

    def reconstruct_context(
        self,
        signal: IncidentSignal,
        mode: Literal["fast", "deep"] = "fast",
    ) -> Context:
        return self._engine.reconstruct_context(signal, mode=mode)  # type: ignore[arg-type]

    def close(self) -> None:
        self._engine.close()
