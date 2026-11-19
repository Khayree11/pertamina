from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..ai import chat as chat_service
from ..ai import gemini, memory
from ..config import get_settings
from ..deps import CurrentUser, get_current_user, get_db_nolock
from ..schemas import ChatIn

router = APIRouter(prefix="/api/chat", tags=["chatbot"])


@router.post("")
def ask(body: ChatIn, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_nolock)):
    # Tidak memegang WRITE_LOCK karena menunggu layanan eksternal (Gemini).
    return chat_service.answer(db, user, body)


@router.get("/info")
def info(user: CurrentUser = Depends(get_current_user)):
    s = get_settings()
    return {
        "suggestions": chat_service.SUGGESTIONS,
        "ai_configured": gemini.configured(),
        "model": s.gemini_model,
        "disclaimer": chat_service.DISCLAIMER,
        "free_tier_note": (
            "Prototipe memakai Gemini API tier gratis — data yang dikirim hanya pertanyaan yang sudah dianonimkan, "
            "kategori komorbid generik, dan kategori area. Versi produksi memakai tier berbayar/enterprise atau "
            "model on-premise."
        ),
        "memory_note": "Percakapan tersimpan agar tidak hilang saat Anda kembali. Anda dapat menghapusnya kapan saja.",
    }


# ------------------------------------------------------------------ memori percakapan


@router.get("/conversations")
def conversations(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_nolock)):
    return {"items": memory.list_for_user(db, user.id)}


@router.get("/conversations/latest")
def latest_conversation(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_nolock)):
    conv = memory.latest(db, user.id)
    return {"conversation": memory.conversation_view(db, conv) if conv else None}


@router.get("/conversations/{cid}")
def get_conversation(cid: str, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_nolock)):
    conv = memory.get_owned(db, user.id, cid)
    if conv is None:
        raise HTTPException(404, "Percakapan tidak ditemukan")
    return {"conversation": memory.conversation_view(db, conv)}


@router.post("/conversations")
def new_conversation(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_nolock)):
    conv = memory.create(db, user.id)
    db.commit()
    return {"conversation": memory.conversation_view(db, conv)}


@router.delete("/conversations/{cid}")
def delete_conversation(cid: str, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_nolock)):
    conv = memory.get_owned(db, user.id, cid)
    if conv is None:
        raise HTTPException(404, "Percakapan tidak ditemukan")
    memory.remove(db, conv)
    db.commit()
    return {"ok": True}
