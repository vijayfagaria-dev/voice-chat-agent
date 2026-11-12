"""sessions: one row per session (architecture section 4). The id is the browser's UUIDv4 (D08)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg

from app.db.tx import Queryable, Tx

SESSION_STATUSES = ("active", "finalized", "closed")


@dataclass(frozen=True, slots=True)
class Session:
    id: str
    status: str
    outcome: str | None
    version: int
    current_revision: int
    language: str
    active_call_id: str | None
    open_request_id: str | None
    review_flags: list[Any]
    last_activity_at: datetime
    created_at: datetime
    #: Set when the customer deleted the claim from the list (soft delete: the history stays).
    deleted_at: datetime | None = None


COLUMNS = """id, status, outcome, version, current_revision AS "currentRevision", language,
  active_call_id AS "activeCallId", open_request_id AS "openRequestId", review_flags AS "reviewFlags",
  last_activity_at AS "lastActivityAt", created_at AS "createdAt", deleted_at AS "deletedAt\""""


def _session(row: asyncpg.Record) -> Session:
    return Session(
        id=row["id"],
        status=row["status"],
        outcome=row["outcome"],
        version=row["version"],
        current_revision=row["currentRevision"],
        language=row["language"],
        active_call_id=row["activeCallId"],
        open_request_id=row["openRequestId"],
        review_flags=row["reviewFlags"],
        last_activity_at=row["lastActivityAt"],
        created_at=row["createdAt"],
        deleted_at=row["deletedAt"],
    )


async def insert_session(db: Queryable, *, id: str, language: str | None = None) -> Session | None:
    """Inserts a new session with defaults. Returns None when the id already exists (nothing is changed)."""
    row = await db.fetchrow(
        f"""INSERT INTO sessions (id, language) VALUES ($1, COALESCE($2::text, 'en'))
     ON CONFLICT (id) DO NOTHING
     RETURNING {COLUMNS}""",
        id,
        language,
    )
    return _session(row) if row else None


async def get_session(db: Queryable, id: str) -> Session | None:
    row = await db.fetchrow(f"SELECT {COLUMNS} FROM sessions WHERE id = $1", id)
    return _session(row) if row else None


async def lock_session(tx: Tx, id: str) -> Session | None:
    """
    Locks the session row until the transaction ends and returns it (None if there is no such session).
    Every command takes this lock first, which serializes work on one session across processes (D09, D11).
    """
    row = await tx.fetchrow(f"SELECT {COLUMNS} FROM sessions WHERE id = $1 FOR UPDATE", id)
    return _session(row) if row else None


async def save_session(db: Queryable, session: Session) -> Session | None:
    """Writes every mutable column of a loaded session. Returns the stored row, or None if the id doesn't exist."""
    row = await db.fetchrow(
        f"""UPDATE sessions SET status = $2, outcome = $3, version = $4, current_revision = $5, language = $6,
       active_call_id = $7, open_request_id = $8, review_flags = $9::jsonb, last_activity_at = $10
     WHERE id = $1
     RETURNING {COLUMNS}""",
        session.id,
        session.status,
        session.outcome,
        session.version,
        session.current_revision,
        session.language,
        session.active_call_id,
        session.open_request_id,
        session.review_flags,
        session.last_activity_at,
    )
    return _session(row) if row else None


async def list_active_session_ids(db: Queryable) -> list[str]:
    """Ids of the sessions still collecting (status `active`), most recently active first: boot reconciliation (P4-T01)."""
    rows = await db.fetch("SELECT id FROM sessions WHERE status = 'active' ORDER BY last_activity_at DESC, id")
    return [r["id"] for r in rows]


async def list_started_sessions(db: Queryable, limit: int = 50) -> list[Session]:
    """The sessions someone actually used (a call or a field), most recently active first: the start screen's list.

    A visit that never did anything leaves a bare row; it isn't a claim anyone would want to resume, so it is left out.
    """
    rows = await db.fetch(
        f"""SELECT {COLUMNS} FROM sessions s
     WHERE s.deleted_at IS NULL
       AND (EXISTS (SELECT 1 FROM field_candidates f WHERE f.session_id = s.id)
            OR EXISTS (SELECT 1 FROM calls c WHERE c.session_id = s.id))
     ORDER BY last_activity_at DESC, id LIMIT $1""",
        limit,
    )
    return [_session(r) for r in rows]


async def soft_delete_session(db: Queryable, id: str) -> str:
    """Hides a claim from the list: ``"deleted"`` (also when it already was), ``"inCall"`` (a call is on: hang up first)
    or ``"notFound"``. Nothing is removed."""
    row = await db.fetchrow("SELECT active_call_id FROM sessions WHERE id = $1", id)
    if row is None:
        return "notFound"
    if row["active_call_id"] is not None:
        return "inCall"
    await db.execute("UPDATE sessions SET deleted_at = COALESCE(deleted_at, now()) WHERE id = $1", id)
    return "deleted"
