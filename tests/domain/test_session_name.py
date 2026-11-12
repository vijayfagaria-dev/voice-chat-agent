"""A claim is named after its device and problem, so it is recognisable in the list of claims."""

from typing import Any

import pytest

from app.domain.conflicts import ResolvedField
from app.domain.session_name import session_title


def valid(value: Any) -> ResolvedField:
    return ResolvedField(value=value, source="call", collected_at=None, status="valid")


def fields(model: Any = None, problem: Any = None) -> dict[str, ResolvedField]:
    out: dict[str, ResolvedField] = {}
    if model is not None:
        out["deviceModel"] = valid(model)
    if problem is not None:
        out["problemDescription"] = valid(problem)
    return out


@pytest.mark.parametrize(
    ("given", "title"),
    [
        (fields(), None),
        (fields({"brand": "Apple", "model": "iPhone 14"}), "Apple iPhone 14"),
        (fields({"brand": "Apple", "model": "Apple iPhone 14"}), "Apple iPhone 14"),
        (fields(problem={"summary": "display not working", "verbatim": "x"}), "Display not working"),
        (
            fields({"brand": "Apple", "model": "iPhone 14"}, {"summary": "Screen is cracked.", "verbatim": "x"}),
            "Apple iPhone 14 \u2013 screen is cracked",
        ),
        (
            fields(
                {"brand": "Dell", "model": "XPS 13"}, {"summary": "The battery drains within twenty minutes of use"}
            ),
            "Dell XPS 13 \u2013 the battery drains within\u2026",
        ),
        (
            fields({"brand": "Apple", "model": "iPhone 14"}, {"summary": "IPhone screen cracked"}),
            "Apple iPhone 14 \u2013 IPhone screen cracked",
        ),
    ],
)
def test_title(given: dict[str, ResolvedField], title: str | None) -> None:
    assert session_title(given) == title


def test_a_value_that_is_not_valid_is_not_used() -> None:
    given = {
        "deviceModel": ResolvedField(
            value={"brand": "A", "model": "B"}, source="call", collected_at=None, status="skipped"
        )
    }
    assert session_title(given) is None
