"""Compatibility wrapper for identity resolution.

IdentityResolver now delegates to the topology-aware ServiceRegistry so
rename lineage, stable service IDs, and dependency mutations are modeled
consistently across the engine.
"""

from pce.topology.registry import ServiceRegistry


class IdentityResolver(ServiceRegistry):
    """Backward-compatible name for topology-aware identity resolution."""
