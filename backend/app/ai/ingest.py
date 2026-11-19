"""Dokumen sumber -> chunking -> indeks (§6 langkah 1)."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import Chunk, Document
from ..timeutil import utcnow
from .retriever import BM25Index, IndexedChunk, set_index

MAX_CHARS = 900
_HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)$")


def _title_from(text: str, fallback: str) -> str:
    for line in text.splitlines():
        m = _HEADING_RE.match(line.strip())
        if m and len(m.group(1)) == 1:
            return m.group(2).strip()
    return fallback


def chunk_markdown(text: str, max_chars: int = MAX_CHARS) -> list[tuple[str, str]]:
    """Pecah per heading, lalu per paragraf hingga ~max_chars. Hasil: [(heading_path, isi)]."""
    sections: list[tuple[str, list[str]]] = []
    stack: list[str] = []
    current: list[str] = []
    heading = ""
    for raw in text.splitlines():
        line = raw.rstrip()
        m = _HEADING_RE.match(line.strip())
        if m:
            if current:
                sections.append((heading, current))
            level = len(m.group(1))
            stack = stack[: max(level - 1, 0)] + [m.group(2).strip()]
            heading = " › ".join(stack[1:] if len(stack) > 1 else stack)
            current = []
        else:
            current.append(line)
    if current:
        sections.append((heading, current))

    chunks: list[tuple[str, str]] = []
    for head, lines in sections:
        paragraphs = [p.strip() for p in "\n".join(lines).split("\n\n") if p.strip()]
        buf = ""
        for p in paragraphs:
            if len(p) > max_chars:
                sentences = re.split(r"(?<=[.!?])\s+", p)
            else:
                sentences = [p]
            for s in sentences:
                if buf and len(buf) + len(s) + 2 > max_chars:
                    chunks.append((head, buf.strip()))
                    buf = ""
                buf = f"{buf}\n\n{s}" if buf else s
        if buf.strip():
            chunks.append((head, buf.strip()))
    return [(h, c) for h, c in chunks if len(c) >= 40]


def upsert_document(
    db: Session,
    text: str,
    source_file: str,
    category: str = "SOP",
    is_sample: bool = True,
    uploaded_by_user_id: int | None = None,
    title: str | None = None,
) -> Document:
    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    doc = db.scalars(select(Document).where(Document.source_file == source_file)).first()
    if doc and doc.content_hash == content_hash:
        return doc
    now = utcnow()
    if doc is None:
        doc = Document(source_file=source_file, created_at=now, content_hash=content_hash, title="")
        db.add(doc)
        db.flush()
    else:
        db.execute(delete(Chunk).where(Chunk.document_id == doc.id))
    doc.title = title or _title_from(text, Path(source_file).stem)
    doc.category = category
    doc.is_sample = is_sample
    doc.content_hash = content_hash
    doc.updated_at = now
    doc.uploaded_by_user_id = uploaded_by_user_id
    doc.is_active = True
    pieces = chunk_markdown(text)
    for i, (head, content) in enumerate(pieces):
        db.add(Chunk(document_id=doc.id, chunk_index=i, heading=head, content=content, char_count=len(content)))
    doc.chunk_count = len(pieces)
    db.flush()
    return doc


def ingest_directory(db: Session, directory: str) -> int:
    path = Path(directory)
    count = 0
    if not path.exists():
        return 0
    for f in sorted(path.glob("*.md")):
        upsert_document(db, f.read_text(encoding="utf-8"), f"knowledge/{f.name}", category="SOP", is_sample=True)
        count += 1
    return count


def rebuild_index(db: Session) -> dict:
    rows = db.execute(
        select(Chunk, Document)
        .join(Document, Document.id == Chunk.document_id)
        .where(Document.is_active.is_(True))
        .order_by(Document.id, Chunk.chunk_index)
    ).all()
    items = [
        IndexedChunk(
            chunk_id=c.id, document_id=d.id, document_title=d.title, heading=c.heading or "", content=c.content
        )
        for c, d in rows
    ]
    set_index(BM25Index(items))
    return {"documents": len({i.document_id for i in items}), "chunks": len(items)}
