"""The agent in the chat: what answers when the customer types something with no card open.

One conversation, two channels (the brief): it is the same agent as on the call, with the same prompt, tools and turn
engine, working from the same session state. The differences are only where its words go (a chat message, not speech) and
where the customer's words come from (typed, so an identifier typed here counts as typed).

While a call is on, the call agent answers instead: it hears about the typed message through the session's events and
takes it as one more thing the customer said (call_engine.py). So there is never a second voice talking over the call.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from app.agent.chat_planner import is_record_field
from app.agent.grounding import grounding_error
from app.agent.prompt import system_message
from app.agent.state_message import StateInput, state_message
from app.agent.tools import ParsedToolCall
from app.agent.turn_engine import ToolOutcome, TurnDeps, TurnInput, run_turn
from app.agent.voice_templates import OPTED_OUT_GOODBYE, card_sent_ack, saved_ack
from app.db.repos.chat_messages import list_chat_messages
from app.db.repos.field_candidates import list_field_candidates
from app.db.repos.input_requests import list_input_requests
from app.db.repos.sessions import get_session
from app.db.repos.transcript_lines import list_transcript_lines
from app.domain.conflicts import ResolvedField
from app.metrics.usage import record_llm_usage, record_usage
from app.session.snapshot import resolve_fields
from app.voice.types import LlmMessage, LlmRoute, LlmUsage

#: How much of the conversation the model sees: the latest messages of the call and the chat together.
HISTORY_MESSAGES = 24

CHANNEL_NOTE = LlmMessage(
    role="system",
    content=(
        "CHANNEL This turn is in the chat window, not on a call: the customer typed to you and reads your reply. "
        "Write one or two short plain sentences, one question at a time. Their typed words are their exact words, so "
        "save_field works on them. Do not say goodbye and do not call end_call. The chat cards are the way to collect "
        "files and anything long."
    ),
)


class ChatAgent:
    def __init__(self, *, pool: Any, processor: Any, llm_factory: Callable[[], Any], log: Any) -> None:
        self._pool = pool
        self._processor = processor
        self._llm_factory = llm_factory
        self._log = log
        self._locks: dict[str, asyncio.Lock] = {}
        self._dirty: set[str] = set()
        self._tasks: set[asyncio.Task[Any]] = set()

    def _spawn(self, coro: Any) -> None:
        task = asyncio.ensure_future(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def said(self, session_id: str) -> None:
        """The customer typed something: answer it, unless a call is on or an answer is already being written (it then
        reads the new message too: one answer at a time, and it covers everything said so far)."""
        self._spawn(self._respond(session_id))

    async def drain(self) -> None:
        """Waits for the answers in flight (shutdown and tests)."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    async def _respond(self, session_id: str) -> None:
        lock = self._locks.setdefault(session_id, asyncio.Lock())
        if lock.locked():
            self._dirty.add(session_id)
            return
        async with lock:
            while True:
                self._dirty.discard(session_id)
                try:
                    await self._one_turn(session_id)
                except Exception as err:
                    self._log.error("chat agent turn failed", session_id=session_id, message=str(err))
                if session_id not in self._dirty:
                    return

    async def _history(self, session_id: str) -> list[LlmMessage]:
        lines = [(m.event_seq, m.role, m.text) for m in await list_chat_messages(self._pool, session_id)]
        lines += [(t.event_seq, t.role, t.text) for t in await list_transcript_lines(self._pool, session_id)]
        messages: list[LlmMessage] = []
        for _, role, text in sorted(lines)[-HISTORY_MESSAGES:]:
            if text.strip():
                messages.append(LlmMessage(role="user" if role == "user" else "assistant", content=text))
        return messages

    async def _state(self, session_id: str) -> LlmMessage:
        session = await get_session(self._pool, session_id)
        assert session is not None
        candidates = await list_field_candidates(self._pool, session_id)
        requests = await list_input_requests(self._pool, session_id)
        fields: dict[str, ResolvedField] = resolve_fields(candidates)
        now = datetime.now(UTC)
        return state_message(
            StateInput(
                now=now,
                call_started_at=now.timestamp() * 1000,
                session=session,
                fields=fields,
                requests=requests,
                is_returning_call=False,
                new_chat_events=[],
            )
        )

    async def _one_turn(self, session_id: str) -> None:
        session = await get_session(self._pool, session_id)
        if session is None or session.status != "active" or session.active_call_id is not None:
            return
        history = await self._history(session_id)
        if not history or history[-1].role != "user":
            return  # nothing waiting for an answer
        said = [m.content or "" for m in history if m.role == "user"]

        def on_round(route: LlmRoute, usage: LlmUsage | None) -> None:
            self._spawn(self._record(session_id, route, usage))

        class Sink:
            def __init__(self) -> None:
                self.parts: list[str] = []

            def say(self, text: str) -> None:
                self.parts.append(text)

            def break_chunk(self) -> None:
                pass

        sink = Sink()
        await run_turn(
            TurnDeps(llm=self._llm_factory(), tools=_Tools(self, session_id, said), on_round=on_round),
            TurnInput(history=[system_message(), CHANNEL_NOTE, *history], state=lambda: self._state(session_id)),
            sink,
        )
        text = "".join(sink.parts).strip()
        if text:
            await self._processor.dispatch(session_id, {"type": "AgentSays", "text": text})

    async def _record(self, session_id: str, route: LlmRoute, usage: LlmUsage | None) -> None:
        try:
            if usage is not None:
                await record_llm_usage(
                    self._pool,
                    session_id=session_id,
                    provider=route.provider,
                    model=route.model,
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                    cached_tokens=min(usage.cached_tokens, usage.prompt_tokens),
                )
            else:
                await record_usage(
                    self._pool, session_id=session_id, provider=route.provider, kind=f"{route.model}:requests", units=1
                )
        except Exception as err:
            self._log.warning("chat agent usage not recorded", message=str(err))

    async def dispatch(self, session_id: str, command: dict[str, Any]) -> dict[str, Any]:
        reply = (await self._processor.dispatch(session_id, command)).reply
        return reply if isinstance(reply, dict) else {}


class _Tools:
    """The tools in the chat: the call agent's, minus ending a call."""

    def __init__(self, agent: ChatAgent, session_id: str, said: list[str]) -> None:
        self._agent = agent
        self._session_id = session_id
        self._said = said

    async def run(self, call: ParsedToolCall) -> ToolOutcome:
        args, send = call.args, self._agent.dispatch
        sid = self._session_id
        if call.name == "save_field":
            ungrounded = grounding_error(args["spoken_evidence"], self._said)
            if ungrounded:
                return ToolOutcome(result={"status": "rejected", "error": ungrounded}, ok=False, quiet=True)
            reply = await send(
                sid,
                {
                    "type": "SaveSpokenField",
                    "field": args["field"],
                    "value": args["value"],
                    "evidence": args["spoken_evidence"],
                    "source": "chat",
                    **({"user_confirmed": args["user_confirmed"]} if args.get("user_confirmed") is not None else {}),
                },
            )
            status = reply.get("status")
            if status in ("valid", "unverified"):
                return ToolOutcome(
                    result={"status": "valid"}, ok=True, ack=saved_ack(args["field"], reply.get("normalized"))
                )
            if status == "invalid":
                return ToolOutcome(result={"status": "invalid", "error": reply.get("error")}, ok=False)
            return ToolOutcome(result={"status": "refused", "reason": reply.get("reason") or "unknown"}, ok=False)
        if call.name == "request_chat_input":
            reply = await send(sid, {"type": "RequestInput", "field": args["field"]})
            if reply.get("status") in ("queued", "alreadyPending"):
                return ToolOutcome(result={"status": "sent"}, ok=True, ack=card_sent_ack(args["field"]))
            return ToolOutcome(result={"status": "refused", "reason": reply.get("reason") or "unknown"}, ok=False)
        if call.name == "flag_for_review":
            await send(sid, {"type": "FlagForReview", "kind": args["kind"], "reason": args["reason"]})
            return ToolOutcome(result={"status": "flagged"}, ok=True)
        if call.name == "opt_out":
            if not args["confirmed"]:
                return ToolOutcome(
                    result={"status": "confirmFirst", "note": "ask the customer to confirm they want to stop"}, ok=False
                )
            reply = await send(sid, {"type": "OptOutByCall"})
            if reply.get("status") == "optedOut":
                return ToolOutcome(result={"status": "optedOut"}, ok=True, ack=OPTED_OUT_GOODBYE)
            return ToolOutcome(result={"status": "refused", "reason": reply.get("reason") or "unknown"}, ok=False)
        return ToolOutcome(result={"status": "notInACall"}, ok=True)  # end_call: there is no call to end here


__all__ = ["CHANNEL_NOTE", "ChatAgent", "is_record_field"]
