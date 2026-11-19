"""Memori percakapan asisten: disimpan per pengguna sehingga tidak ter-reset saat kembali.

- `content`  : teks asli (hanya ditampilkan ke pemiliknya).
- `content_sanitized` : versi teranonimkan — HANYA ini yang dipakai sebagai riwayat untuk LLM.
"""
from __future__ import annotations

from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..models import ChatConversation, ChatMessage
from ..timeutil import iso, utcnow

HISTORY_MESSAGES = 10  # ~5 giliran tanya-jawab terakhir dikirim sebagai konteks


def latest(db: Session, user_id: int) -> ChatConversation | None:
    return db.scalars(
        select(ChatConversation).where(ChatConversation.user_id == user_id).order_by(ChatConversation.updated_at.desc()).limit(1)
    ).first()


def get_owned(db: Session, user_id: int, conversation_id: str) -> ChatConversation | None:
    conv = db.get(ChatConversation, conversation_id)
    return conv if conv is not None and conv.user_id == user_id else None


def create(db: Session, user_id: int) -> ChatConversation:
    now = utcnow()
    conv = ChatConversation(id=uuid4().hex, user_id=user_id, title="Percakapan baru", created_at=now, updated_at=now)
    db.add(conv)
    db.flush()
    return conv


def get_or_create(db: Session, user_id: int, conversation_id: str | None) -> ChatConversation:
    if conversation_id:
        conv = get_owned(db, user_id, conversation_id)
        return conv if conv is not None else create(db, user_id)
    return latest(db, user_id) or create(db, user_id)


def history(db: Session, conversation_id: str, limit: int = HISTORY_MESSAGES) -> list[tuple[str, str]]:
    rows = db.scalars(
        select(ChatMessage).where(ChatMessage.conversation_id == conversation_id).order_by(ChatMessage.id.desc()).limit(limit)
    ).all()
    return [(m.role, m.content_sanitized) for m in reversed(rows)]


def add(db: Session, conv: ChatConversation, role: str, content: str, sanitized: str, meta: dict | None = None) -> ChatMessage:
    now = utcnow()
    msg = ChatMessage(
        conversation_id=conv.id, role=role, content=content, content_sanitized=sanitized, meta=meta or {}, created_at=now
    )
    db.add(msg)
    conv.updated_at = now
    if role == "user" and conv.title == "Percakapan baru":
        t = " ".join(content.split())
        conv.title = (t[:77] + "…") if len(t) > 80 else t
    db.flush()
    return msg


def message_view(m: ChatMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "meta": m.meta or {}, "created_at": iso(m.created_at)}


def conversation_view(db: Session, conv: ChatConversation, with_messages: bool = True) -> dict:
    data = {
        "id": conv.id,
        "title": conv.title,
        "created_at": iso(conv.created_at),
        "updated_at": iso(conv.updated_at),
        "message_count": db.scalar(select(func.count(ChatMessage.id)).where(ChatMessage.conversation_id == conv.id)) or 0,
    }
    if with_messages:
        msgs = db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == conv.id).order_by(ChatMessage.id)).all()
        data["messages"] = [message_view(m) for m in msgs]
    return data


def list_for_user(db: Session, user_id: int, limit: int = 20) -> list[dict]:
    convs = db.scalars(
        select(ChatConversation).where(ChatConversation.user_id == user_id).order_by(ChatConversation.updated_at.desc()).limit(limit)
    ).all()
    return [conversation_view(db, c, with_messages=False) for c in convs]


def remove(db: Session, conv: ChatConversation) -> None:
    db.execute(delete(ChatMessage).where(ChatMessage.conversation_id == conv.id))
    db.delete(conv)
    db.flush()
