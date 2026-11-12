"""The claim summary reads the way a person would say it, not as stored values."""

import pytest

from app.agent.chat_templates import summary_value
from app.domain.conflicts import ResolvedField


def started(date: str, precision: str) -> str:
    field = ResolvedField(
        value={"date": date, "precision": precision, "spoken": "x"}, source="call", collected_at=None, status="valid"
    )
    return summary_value("problemStartedAt", field)


@pytest.mark.parametrize(
    ("date", "precision", "shown"),
    [
        ("2026-11-10", "day", "10 Nov 2026"),
        ("2026-11-02", "week", "Week of 2 Nov 2026"),
        ("2026-10-01", "month", "Oct 2026"),
    ],
)
def test_a_start_date_is_shown_as_words(date: str, precision: str, shown: str) -> None:
    assert started(date, precision) == shown


def test_an_optional_field_nobody_filled_says_not_provided() -> None:
    field = ResolvedField(value=None, source=None, collected_at=None, status="missing")
    assert summary_value("additionalNotes", field) == "not provided"
