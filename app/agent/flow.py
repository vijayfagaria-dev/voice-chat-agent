"""What the call agent does next, decided by the system and not by the model (the "flow", one conversation, two channels).

The model's job is language: understanding what the customer said, saving it, and saying the next thing in its own words.
The order of the conversation is not its job. Left to the model, the chat cards came whenever it remembered them
(live 2026-11-12: the IMEI card opened while the agent was still asking about urgency, and the agent asked for an email
that was already typed). So the order is fixed here and the state tells the model the one thing to do:

1. the voice questions, in order (device type, model, problem, when it started, urgency);
2. then the chat cards, one at a time, each opened by the system at the start of the turn that announces it, so the card
   and the agent's words about it arrive together; the agent then waits for the card;
3. then the Submit card, with the agent reading back the main details.

``next_step`` is pure. ``{"open": field}`` is for the call engine to carry out (it opens the card); the ``say`` forms
go to the model in the state message.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.agent.chat_planner import FieldState
from app.db.repos.input_requests import StoredInputRequest
from app.domain.conflicts import ResolvedField
from app.domain.fields import CALL_FIELDS, CHAT_FIELDS, CONFIRMATION_FIELD, REQUIRED_RECORD_FIELDS


def next_step(
    *,
    fields: Mapping[str, ResolvedField],
    requests: Sequence[StoredInputRequest],
    just_opened: str | None = None,
) -> dict[str, Any]:
    """``{"open": field}`` (a card to open now) or ``{"say": ..., "field"?: ...}`` (what the agent does this turn)."""
    state = FieldState(resolved=fields, _cards=lambda field_id: [r for r in requests if r.field == field_id])
    # 1. The voice questions, in order.
    for field_id in CALL_FIELDS:
        if fields[field_id].status != "valid" and not state.stuck(field_id):
            return {"say": "ask", "field": field_id}
    # 2. A card is waiting: said the turn it opened, then waited for.
    pending = next((r.field for r in requests if r.status in ("open", "queued")), None)
    if pending is not None:
        if pending == CONFIRMATION_FIELD:
            return {"say": "readBack" if just_opened == pending else "waitForConfirm"}
        return {"say": "announceCard" if just_opened == pending else "waitForCard", "field": pending}
    # 3. Nothing is waiting: the next card.
    for field_id in CHAT_FIELDS:
        if state.needs(field_id):
            return {"open": field_id}
    # 4. Everything required is in: the Submit card. Otherwise something couldn't be accepted.
    if all(fields[field_id].status == "valid" for field_id in REQUIRED_RECORD_FIELDS):
        return {"open": CONFIRMATION_FIELD}
    return {"say": "stuck"}
