from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..audit import write_audit
from ..config import get_settings
from ..constants import ROLE_ADMIN
from ..deps import CurrentUser, get_current_user, get_db
from ..models import AnnualMCU

router = APIRouter(prefix="/api/files", tags=["berkas"])


@router.get("/mcu/{mid}")
def mcu_document(mid: int, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(AnnualMCU, mid)
    if m is None or not m.document_path:
        raise HTTPException(404, "Dokumen tidak ditemukan")
    if user.role != ROLE_ADMIN and m.employee_id != user.employee_id:
        raise HTTPException(403, "Tidak berwenang membuka dokumen ini")
    path = Path(m.document_path).resolve()
    base = get_settings().upload_dir.resolve()
    if base not in path.parents or not path.exists():
        raise HTTPException(404, "Dokumen tidak ditemukan")
    if user.role == ROLE_ADMIN:
        # Akses admin ke dokumen medis dicatat (lihat §3: kewenangan admin).
        from ..db import WRITE_LOCK

        with WRITE_LOCK:
            write_audit(db, user, "MCU_DOCUMENT_VIEWED", "annual_mcu", m.id, m.employee_id, {})
            db.commit()
    return FileResponse(path, media_type=m.document_mime or "application/octet-stream", filename=m.document_filename)
