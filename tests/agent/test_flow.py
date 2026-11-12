"""The order of the conversation is the system's: voice questions, then one card at a time, then the Submit card."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.agent.flow import next_step
from app.domain.fields import CALL_FIELDS, CHAT_FIELDS, RECORD_FIELD_IDS
from tests.domain.helpers import resolved


def fields(valid: tuple[str, ...] = (), **over: Any) -> dict[str, Any]:
    out = {i: resolved("missing") for i in RECORD_FIELD_IDS}
    for f in valid:
        out[f] = resolved("valid", "x", "call")
    out.update(over)
    return out


def card(field: str, status: str = "open", attempts: int = 0) -> Any:
    return SimpleNamespace(field=field, status=status, attempts=attempts)


def test_the_voice_questions_come_first_in_order() -> None:
    assert next_step(fields=fields(), requests=[]) == {"say": "ask", "field": "deviceType"}
    assert next_step(fields=fields(CALL_FIELDS[:4]), requests=[]) == {"say": "ask", "field": "urgency"}


def test_no_card_is_opened_while_a_voice_question_is_still_open() -> None:
    # Live 2026-11-12: the IMEI card appeared while the agent was still asking about urgency.
    assert next_step(fields=fields(CALL_FIELDS[:4]), requests=[]).get("open") is None


def test_then_the_cards_one_at_a_time_in_order() -> None:
    assert next_step(fields=fields(CALL_FIELDS), requests=[]) == {"open": "serialNumber"}
    assert next_step(fields=fields((*CALL_FIELDS, "serialNumber")), requests=[]) == {"open": "purchaseInvoice"}


def test_a_card_that_just_opened_is_announced_then_waited_for() -> None:
    requests = [card("serialNumber")]
    assert next_step(fields=fields(CALL_FIELDS), requests=requests, just_opened="serialNumber") == {
        "say": "announceCard",
        "field": "serialNumber",
    }
    assert next_step(fields=fields(CALL_FIELDS), requests=requests) == {"say": "waitForCard", "field": "serialNumber"}


def test_nothing_is_opened_while_a_card_is_waiting() -> None:
    assert "open" not in next_step(fields=fields(CALL_FIELDS), requests=[card("email", "queued")])


def test_when_every_required_field_is_in_the_submit_card_is_next_then_read_back_then_waited_for() -> None:
    everything = fields((*CALL_FIELDS, *CHAT_FIELDS))
    assert next_step(fields=everything, requests=[]) == {"open": "submitConfirmation"}
    submit = [card("submitConfirmation")]
    assert next_step(fields=everything, requests=submit, just_opened="submitConfirmation") == {"say": "readBack"}
    assert next_step(fields=everything, requests=submit) == {"say": "waitForConfirm"}


def test_a_field_given_up_on_is_skipped_and_the_claim_is_called_stuck_at_the_end() -> None:
    gave_up = [card("urgency", "cancelled", attempts=3)]
    step = next_step(fields=fields(CALL_FIELDS[:4]), requests=gave_up)
    assert step.get("say") != "ask"
    assert next_step(fields=fields((*CALL_FIELDS[:4], *CHAT_FIELDS)), requests=gave_up) == {"say": "stuck"}
