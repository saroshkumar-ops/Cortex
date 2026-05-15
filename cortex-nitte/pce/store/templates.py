"""Drain-style streaming log templater.

Real production logs are enormous and 99% repetitive. The same structural
event — "timeout calling payments-svc (req_id=ABC, attempt=1)" — fires
thousands of times with varying parameter values. Storing each as a raw
string is wasteful AND it makes downstream behavioral abstraction noisy:
two structurally identical logs with different request IDs should produce
the same behavioral token, but a naive tokenizer treats them as different.

This module assigns each log message to a *template* — a sequence of fixed
tokens interspersed with `<*>` wildcards for the varying positions. The
template id (stable integer) becomes the canonical handle on the log's
structural shape. The matcher's behavioral signatures key off template ids
rather than raw text, so the matcher remains rename-invariant AND
parameter-invariant.

Algorithm (a simplified Drain):
  1. Tokenize the message on whitespace + common separators.
  2. Bucket by token count (templates of different lengths can never match).
  3. Within the length bucket, find the existing template with the highest
     positional-match ratio. If above `similarity_threshold`, merge: any
     position where the new tokens differ from the stored template becomes
     a wildcard.
  4. Otherwise, register the message as a new template.

Performance:
  - O(templates_in_length_bucket) per log on ingest.
  - In practice convergence is fast — after a few thousand logs, almost all
    new arrivals match an existing template and the registry stops growing.
  - Truncation at `max_message_chars` caps worst-case cost on adversarially
    long log lines.
"""

import re


# Tokens are runs of identifier-friendly characters. Treats whitespace,
# punctuation, brackets as delimiters. Aggressive enough to surface
# structural patterns without exploding the token count on JSON-ish payloads.
_TOKEN_RE = re.compile(r"[A-Za-z0-9_\.\-/:]+")

WILDCARD = "<*>"


class LogTemplate:
    """A structural pattern. Mutable — wildcards spread as new logs merge in."""

    __slots__ = ("id", "tokens", "frequency", "first_seen", "last_seen")

    def __init__(self, template_id: int, tokens: list[str], ts: float) -> None:
        self.id = template_id
        self.tokens = tokens          # positional list; entries are literals or WILDCARD
        self.frequency = 1
        self.first_seen = ts
        self.last_seen = ts

    def match_ratio(self, candidate: list[str]) -> float:
        """Fraction of positions where this template's token matches the
        candidate token (wildcards count as matches)."""
        if len(candidate) != len(self.tokens):
            return 0.0
        matches = 0
        for a, b in zip(self.tokens, candidate):
            if a == WILDCARD or a == b:
                matches += 1
        return matches / len(self.tokens)

    def merge(self, candidate: list[str]) -> None:
        """Generalize this template against a new candidate. Differing
        positions become wildcards; wildcard positions stay wildcard."""
        for i, (a, b) in enumerate(zip(self.tokens, candidate)):
            if a == WILDCARD:
                continue
            if a != b:
                self.tokens[i] = WILDCARD

    def pattern(self) -> str:
        """Human-readable template, e.g. 'timeout calling <*> (req_id=<*>)'."""
        return " ".join(self.tokens)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "pattern": self.pattern(),
            "frequency": self.frequency,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
        }


class TemplateRegistry:
    """Streaming clusterer. Stateful — call `template_for` per arriving log."""

    __slots__ = ("similarity_threshold", "max_message_chars", "_by_length", "_templates", "_next_id")

    def __init__(self, similarity_threshold: float = 0.5, max_message_chars: int = 512) -> None:
        self.similarity_threshold = similarity_threshold
        self.max_message_chars = max_message_chars
        self._by_length: dict[int, list[int]] = {}    # token_count -> [template_id, ...]
        self._templates: dict[int, LogTemplate] = {}  # template_id -> LogTemplate
        self._next_id = 0

    def template_for(self, msg: str | None, ts: float) -> tuple[int, list[str]]:
        """Assign `msg` to a template. Returns (template_id, extracted_params).

        - On no match above threshold, registers a new template and returns its id.
        - On match, merges into the existing template (spreading wildcards as
          needed), bumps frequency, and returns the params at the wildcard
          positions of the post-merge pattern.
        - For empty / unparseable messages, returns (-1, []).
        """
        if not msg:
            return -1, []
        tokens = self._tokenize(msg[: self.max_message_chars])
        if not tokens:
            return -1, []

        bucket = self._by_length.setdefault(len(tokens), [])

        best_id: int | None = None
        best_score = 0.0
        for tid in bucket:
            tpl = self._templates[tid]
            score = tpl.match_ratio(tokens)
            if score > best_score:
                best_score = score
                best_id = tid

        if best_id is not None and best_score >= self.similarity_threshold:
            tpl = self._templates[best_id]
            tpl.merge(tokens)
            tpl.frequency += 1
            tpl.last_seen = ts
            params = self._extract_params(tpl.tokens, tokens)
            return best_id, params

        # No template matched — register a new one.
        new_id = self._next_id
        self._next_id += 1
        self._templates[new_id] = LogTemplate(new_id, list(tokens), ts)
        bucket.append(new_id)
        return new_id, []

    def get(self, template_id: int) -> LogTemplate | None:
        return self._templates.get(template_id)

    def count(self) -> int:
        return len(self._templates)

    def total_observations(self) -> int:
        return sum(t.frequency for t in self._templates.values())

    def compression_ratio(self) -> float:
        """How much storage we'd save if raw msgs were dropped in favor of
        (template_id, params). Approximation; useful as a one-number metric."""
        obs = self.total_observations()
        if obs == 0:
            return 0.0
        return obs / max(self.count(), 1)

    def all_templates(self) -> list[dict]:
        return [t.to_dict() for t in self._templates.values()]

    @staticmethod
    def _tokenize(msg: str) -> list[str]:
        return _TOKEN_RE.findall(msg)

    @staticmethod
    def _extract_params(template_tokens: list[str], candidate_tokens: list[str]) -> list[str]:
        return [
            candidate_tokens[i]
            for i, t in enumerate(template_tokens)
            if t == WILDCARD
        ]
