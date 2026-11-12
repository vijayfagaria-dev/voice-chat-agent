"""What a claim is called in the list of claims: the device and the problem, once they are known.

The name is worked out from the fields as they stand now (never stored), so a correction renames the claim and nothing
needs a migration. Nothing is asked of a model. A claim with neither a device nor a problem has no title yet; the page
then calls it "New claim" with the time it was started, which is also how two claims about the same device stay apart.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.domain.conflicts import ResolvedField

#: The longest the problem part of a title gets before it is cut at a word.
PROBLEM_CHARS = 32


def _text(value: Any) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def _device(fields: Mapping[str, ResolvedField]) -> str:
    resolved = fields.get("deviceModel")
    if resolved is None or resolved.status != "valid" or not isinstance(resolved.value, Mapping):
        return ""
    brand, model = _text(resolved.value.get("brand")), _text(resolved.value.get("model"))
    if brand and model and brand.lower() in model.lower():
        return model  # "Apple iPhone 14" already says it
    return " ".join(part for part in (brand, model) if part)


def _problem(fields: Mapping[str, ResolvedField]) -> str:
    resolved = fields.get("problemDescription")
    if resolved is None or resolved.status != "valid" or not isinstance(resolved.value, Mapping):
        return ""
    text = _text(resolved.value.get("summary")) or _text(resolved.value.get("verbatim"))
    text = re.sub(r"[.!?\s]+$", "", text)
    if len(text) > PROBLEM_CHARS:
        text = text[:PROBLEM_CHARS].rsplit(" ", 1)[0].rstrip(",;:- ") + "\u2026"
    return text[:1].lower() + text[1:] if text[:2].isalpha() and not text[:2].isupper() else text


def session_title(fields: Mapping[str, ResolvedField]) -> str | None:
    """ "iPhone 14 \u2013 display not working", "iPhone 14", "display not working" or None when neither is known."""
    device, problem = _device(fields), _problem(fields)
    if device and problem:
        return f"{device} \u2013 {problem}"
    return device or (problem[:1].upper() + problem[1:] if problem else None)
