"""Service identity + topology registry.

Provides stable service IDs, rename lineage, and dependency graph mutations.
All similarity logic should resolve to service IDs, while human-facing output
uses the latest canonical service name.
"""

from __future__ import annotations

import hashlib
import struct
from typing import Iterable

from pce.schema import Event
from pce.store.event_log import _parse_ts


class ServiceRegistry:
    __slots__ = (
        "_name_to_id",
        "_id_to_name",
        "_renames",
        "_aliases_of",
        "_deps_out",
        "_deps_in",
        "_next_id",
    )

    def __init__(self) -> None:
        self._name_to_id: dict[str, int] = {}
        self._id_to_name: dict[int, str] = {}
        # name -> (successor_name, ts)
        self._renames: dict[str, tuple[str, float]] = {}
        # service_id -> aliases (lazy rebuild)
        self._aliases_of: dict[int, set[str]] = {}
        # dependency graph (directed) by service id
        self._deps_out: dict[int, set[int]] = {}
        self._deps_in: dict[int, set[int]] = {}
        self._next_id = 1

    # ---- topology ingestion ----

    def observe_topology(self, event: Event) -> None:
        change = event.get("change") or ""
        if change == "rename":
            src = event.get("from_") or event.get("from") or event.get("service")
            dst = event.get("to")
            if not src or not dst or src == dst:
                return
            ts = _parse_ts(event.get("ts", ""))
            src_id = self._ensure_id(src)
            dst_id = self._name_to_id.get(dst)
            if dst_id is not None and dst_id != src_id:
                self._merge_ids(src_id, dst_id)
            self._name_to_id[dst] = src_id
            self._id_to_name[src_id] = dst
            # Keep the first hop for a given source name (chains follow onward).
            if src not in self._renames:
                self._renames[src] = (dst, ts)
            self._aliases_of.clear()
            return

        if change in {"dep_add", "dep_remove"}:
            src = event.get("from_") or event.get("from") or event.get("service")
            dst = event.get("to")
            if not src or not dst:
                return
            src_id = self._ensure_id(src)
            dst_id = self._ensure_id(dst)
            if change == "dep_add":
                self._deps_out.setdefault(src_id, set()).add(dst_id)
                self._deps_in.setdefault(dst_id, set()).add(src_id)
            else:
                self._deps_out.get(src_id, set()).discard(dst_id)
                self._deps_in.get(dst_id, set()).discard(src_id)

    # ---- identity resolution ----

    def canonical(self, name: str | None, at_ts: str | float | None = None) -> str | None:
        if not name:
            return None
        cutoff = self._cutoff_ts(at_ts)
        name_at = self._resolve_name_at(name, cutoff)
        svc_id = self._name_to_id.get(name_at)
        if svc_id is None:
            svc_id = self._ensure_id(name_at)
        if at_ts is None:
            return self._id_to_name.get(svc_id, name_at)
        return name_at

    def canonical_id(self, name: str | None, at_ts: str | float | None = None) -> int | None:
        if not name:
            return None
        cutoff = self._cutoff_ts(at_ts)
        name_at = self._resolve_name_at(name, cutoff)
        return self._ensure_id(name_at)

    def canonical_name(self, service_id: int | None) -> str | None:
        if service_id is None:
            return None
        return self._id_to_name.get(service_id)

    def aliases(self, canonical_name: str | None) -> set[str]:
        if not canonical_name:
            return set()
        if not self._aliases_of:
            self._rebuild_alias_cache()
        svc_id = self._name_to_id.get(canonical_name)
        if svc_id is None:
            return {canonical_name}
        return self._aliases_of.get(svc_id, {canonical_name})

    # ---- topology graph helpers ----

    def neighbors(self, service_id: int | None) -> set[int]:
        if service_id is None:
            return set()
        return set(self._deps_out.get(service_id, set())) | set(self._deps_in.get(service_id, set()))

    def cluster_signatures(self, service_ids: Iterable[int]) -> set[str]:
        ids = {i for i in service_ids if i is not None}
        if not ids:
            return set()
        seen: set[int] = set()
        sigs: set[str] = set()
        for sid in ids:
            if sid in seen:
                continue
            comp = self._collect_component(sid)
            seen.update(comp)
            sigs.add(self._component_signature(comp))
        return sigs

    # ---- internals ----

    def _ensure_id(self, name: str) -> int:
        existing = self._name_to_id.get(name)
        if existing is not None:
            return existing
        svc_id = self._next_id
        self._next_id += 1
        self._name_to_id[name] = svc_id
        self._id_to_name.setdefault(svc_id, name)
        self._aliases_of.clear()
        return svc_id

    def _merge_ids(self, keep_id: int, drop_id: int) -> None:
        if keep_id == drop_id:
            return
        for name, sid in list(self._name_to_id.items()):
            if sid == drop_id:
                self._name_to_id[name] = keep_id
        # Rewire incoming edges
        for src in list(self._deps_in.get(drop_id, set())):
            self._deps_out.get(src, set()).discard(drop_id)
            self._deps_out.setdefault(src, set()).add(keep_id)
            self._deps_in.setdefault(keep_id, set()).add(src)
        # Rewire outgoing edges
        for dst in list(self._deps_out.get(drop_id, set())):
            self._deps_in.get(dst, set()).discard(drop_id)
            self._deps_in.setdefault(dst, set()).add(keep_id)
            self._deps_out.setdefault(keep_id, set()).add(dst)
        self._deps_in.pop(drop_id, None)
        self._deps_out.pop(drop_id, None)
        self._id_to_name.pop(drop_id, None)
        self._aliases_of.clear()

    def _resolve_name_at(self, name: str, cutoff: float) -> str:
        current = name
        seen: set[str] = set()
        while current in self._renames and current not in seen:
            seen.add(current)
            nxt, ts = self._renames[current]
            if ts > cutoff:
                break
            current = nxt
        return current

    def _cutoff_ts(self, at_ts: str | float | None) -> float:
        if at_ts is None:
            return float("inf")
        if isinstance(at_ts, str):
            return _parse_ts(at_ts) if at_ts else float("inf")
        return at_ts

    def _rebuild_alias_cache(self) -> None:
        self._aliases_of = {}
        for name, sid in self._name_to_id.items():
            self._aliases_of.setdefault(sid, set()).add(name)

    def _collect_component(self, start: int) -> set[int]:
        stack = [start]
        visited: set[int] = set()
        while stack:
            cur = stack.pop()
            if cur in visited:
                continue
            visited.add(cur)
            for nbr in self.neighbors(cur):
                if nbr not in visited:
                    stack.append(nbr)
        return visited

    @staticmethod
    def _component_signature(nodes: Iterable[int]) -> str:
        ids = sorted(nodes)
        packed = struct.pack(f"<{len(ids)}I", *ids) if ids else b""
        digest = hashlib.blake2b(packed, digest_size=6, person=b"pce-topo").hexdigest()
        return f"cluster:{ids[0] if ids else 0}:{len(ids)}:{digest}"
