"""MinHash signatures over token multisets — pure stdlib.

128 permutations, each a deterministic hash of (token, perm_seed) using
blake2b. Jaccard similarity ≈ fraction of matching signature positions,
which is what the LSH layer in matcher.py exploits for sublinear lookup.

Why blake2b: stdlib, no deps, takes a `person` salt for cheap permutation,
fast enough that recomputing signatures during evaluation is not a hot path.
"""

import hashlib
import struct
from typing import Iterable


NUM_PERMUTATIONS = 128
_MAX_HASH = (1 << 64) - 1


def _hash(token: str, perm: int) -> int:
    """Deterministic 64-bit hash of `token` under permutation seed `perm`."""
    # blake2b 'person' is up to 16 bytes — use as our permutation salt.
    person = perm.to_bytes(8, "little") + b"\x00pce-mh"
    h = hashlib.blake2b(token.encode("utf-8"), digest_size=8, person=person)
    return int.from_bytes(h.digest(), "little")


def minhash(tokens: Iterable[str], num_perms: int = NUM_PERMUTATIONS) -> tuple[int, ...]:
    """Compute a MinHash signature for a token set.

    Returns a tuple of `num_perms` 64-bit ints. Tuples are hashable, so
    they're cheap to store and compare in the LSH layer.
    """
    tokens = list(tokens)
    if not tokens:
        # Empty set: well-defined sentinel signature
        return tuple(0 for _ in range(num_perms))

    sig = [_MAX_HASH] * num_perms
    for t in tokens:
        for p in range(num_perms):
            h = _hash(t, p)
            if h < sig[p]:
                sig[p] = h
    return tuple(sig)


def jaccard(sig_a: tuple[int, ...], sig_b: tuple[int, ...]) -> float:
    """Estimate Jaccard similarity between two MinHash signatures."""
    if len(sig_a) != len(sig_b) or not sig_a:
        return 0.0
    matches = sum(1 for a, b in zip(sig_a, sig_b) if a == b)
    return matches / len(sig_a)


def exact_jaccard(a: set[str], b: set[str]) -> float:
    """Exact Jaccard for small sets — used when MinHash candidate set is small."""
    if not a and not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0
