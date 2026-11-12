"""The agent in the chat answers what the customer types with no card open, from the same state as the call."""

from __future__ import annotations

from typing import Any

import pytest
import structlog

from app.agent.chat_agent import ChatAgent
from app.db.repos.chat_messages import list_chat_messages
from app.db.repos.field_candidates import list_field_candidates
from app.session.handlers.call import StartCall
from app.session.handlers.chat_input import ChatSay
from app.voice.fakes.llm import FakeLlm, LlmScript
from tests.helpers.seed import seed_session
from tests.helpers.session import test_services


@pytest.fixture
async def services(db):  # type: ignore[no-untyped-def]
    return test_services(db)


def agent_for(db: Any, services: Any, llm: FakeLlm) -> ChatAgent:
    return ChatAgent(pool=db.pool, processor=services.processor, llm_factory=lambda: llm, log=structlog.get_logger())


async def type_message(services: Any, id_: str, text: str) -> None:
    await services.processor.dispatch(id_, ChatSay(text=text))


async def test_it_saves_what_was_typed_and_answers_in_the_chat(db, services) -> None:
    id_ = await seed_session(db.pool)
    llm = FakeLlm().enqueue(
        LlmScript(
            tool_calls=[
                {
                    "name": "save_field",
                    "args": {
                        "field": "deviceModel",
                        "value": "Samsung Galaxy S23",
                        "spoken_evidence": "my phone is a Samsung Galaxy S23",
                    },
                }
            ]
        ),
        LlmScript(text="What seems to be wrong with it?"),
    )
    agent = agent_for(db, services, llm)
    await type_message(services, id_, "my phone is a Samsung Galaxy S23")
    agent.said(id_)
    await agent.drain()
    [candidate] = [c for c in await list_field_candidates(db.pool, id_) if c.field == "deviceModel"]
    assert (candidate.source, candidate.status) == ("chat", "valid")
    replies = [m.text for m in await list_chat_messages(db.pool, id_) if m.role == "agent"]
    assert replies[-1].endswith("What seems to be wrong with it?")
    # It was told it is in the chat, not on a call.
    assert any("CHANNEL" in str(m.content) for m in llm.requests[0].messages)


async def test_it_invents_nothing_a_value_the_customer_did_not_type_is_not_saved(db, services) -> None:
    id_ = await seed_session(db.pool)
    llm = FakeLlm().enqueue(
        LlmScript(
            tool_calls=[
                {
                    "name": "save_field",
                    "args": {"field": "deviceModel", "value": "Apple iPhone 14", "spoken_evidence": "Apple iPhone 14"},
                }
            ]
        ),
        LlmScript(text="Which phone is it?"),
    )
    agent = agent_for(db, services, llm)
    await type_message(services, id_, "hello there")
    agent.said(id_)
    await agent.drain()
    assert [c for c in await list_field_candidates(db.pool, id_) if c.field == "deviceModel"] == []


async def test_during_a_call_the_call_agent_answers_not_this_one(db, services) -> None:
    id_ = await seed_session(db.pool)
    await services.processor.dispatch(id_, StartCall(call_id="cX"))
    llm = FakeLlm().enqueue(LlmScript(text="should never be said"))
    agent = agent_for(db, services, llm)
    await type_message(services, id_, "are you there")
    agent.said(id_)
    await agent.drain()
    assert llm.requests == []
    assert [m for m in await list_chat_messages(db.pool, id_) if m.role == "agent"] == []


async def test_two_messages_typed_at_once_get_one_answer_that_covers_both(db, services) -> None:
    id_ = await seed_session(db.pool)
    llm = FakeLlm().enqueue(LlmScript(text="Got both."), LlmScript(text="Anything else?"))
    agent = agent_for(db, services, llm)
    await type_message(services, id_, "first")
    await type_message(services, id_, "second")
    agent.said(id_)
    agent.said(id_)
    await agent.drain()
    users = [str(m.content) for m in llm.requests[-1].messages if m.role == "user"]
    assert users[-2:] == ["first", "second"]
