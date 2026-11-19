"""Model data inti (lihat §7 dokumen perencanaan)."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime
from .timeutil import utcnow


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    position: Mapped[str] = mapped_column(String(128), default="")
    unit: Mapped[str] = mapped_column(String(128), default="")
    work_location: Mapped[str] = mapped_column(String(128), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    card_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    card_active: Mapped[bool] = mapped_column(Boolean, default=True)
    latest_run_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    # Data umum (diisi saat melengkapi profil setelah registrasi)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)  # L / P
    emergency_contact_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    registration_source: Mapped[str | None] = mapped_column(String(16), nullable=True)  # ADMIN / SELF
    # Status kelengkapan profil (onboarding)
    profile_general_done_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    comorbid_declared_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    mcu_deferred_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    profile_completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    user: Mapped[User | None] = relationship(back_populates="employee", uselist=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16))  # WORKER / ADMIN
    full_name: Mapped[str] = mapped_column(String(128))
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    consent_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    employee: Mapped[Employee | None] = relationship(back_populates="user")


class AppSetting(Base):
    """Pengaturan yang dapat diubah admin tanpa deploy ulang (mis. WhatsApp API)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class DailyBPRecord(Base):
    __tablename__ = "daily_bp_records"
    __table_args__ = (Index("ix_bp_employee_date", "employee_id", "record_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    record_date: Mapped[date] = mapped_column(Date)  # tanggal lokal (WIB)
    measured_at: Mapped[datetime] = mapped_column(UTCDateTime)
    systolic: Mapped[int] = mapped_column(Integer)
    diastolic: Mapped[int] = mapped_column(Integer)
    pulse: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="SELF")
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    entered_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class AnnualMCU(Base):
    __tablename__ = "annual_mcu"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    mcu_date: Mapped[date] = mapped_column(Date)
    provider: Mapped[str] = mapped_column(String(128), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    conclusion: Mapped[str] = mapped_column(String(32))  # FIT / FIT_WITH_RESTRICTION / UNFIT
    restricted_areas: Mapped[list] = mapped_column(JSON, default=list)
    doctor_name: Mapped[str] = mapped_column(String(128), default="")
    document_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    document_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    document_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(16), default="UNVERIFIED")
    verified_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    verification_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    entered_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # Variabel terstruktur (template 'Kesimpulan MCU') + jejak pembacaan otomatis
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    extracted: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    extraction_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    edited_fields: Mapped[list | None] = mapped_column(JSON, nullable=True)
    template_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    identity_check: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class McuUpload(Base):
    """Berkas MCU yang sudah dibaca otomatis tetapi belum dikonfirmasi pengguna."""

    __tablename__ = "mcu_uploads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    uploaded_by_user_id: Mapped[int] = mapped_column(Integer)
    file_path: Mapped[str] = mapped_column(String(512))
    filename: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    extraction_status: Mapped[str] = mapped_column(String(24))
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    consumed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    mcu_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ChatConversation(Base):
    """Memori asisten: percakapan tersimpan per pengguna, dimuat ulang saat kembali ke halaman asisten."""

    __tablename__ = "chat_conversations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120), default="Percakapan baru")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("chat_conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user / assistant
    content: Mapped[str] = mapped_column(Text)
    content_sanitized: Mapped[str] = mapped_column(Text)  # versi yang boleh dikirim ke LLM
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Comorbidity(Base):
    __tablename__ = "comorbidities"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    condition_code: Mapped[str] = mapped_column(String(32))
    other_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    controlled: Mapped[bool] = mapped_column(Boolean, default=False)
    diagnosed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(16), default="UNVERIFIED")
    verified_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    verification_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    entered_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class RuleVersion(Base):
    __tablename__ = "rule_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, unique=True)
    label: Mapped[str] = mapped_column(String(128))
    config: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="DRAFT")  # DRAFT / ACTIVE / RETIRED
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    activated_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    activated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_by_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approval_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class AssessmentRun(Base):
    __tablename__ = "assessment_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    assessed_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    trigger: Mapped[str] = mapped_column(String(32))
    rule_version_id: Mapped[int] = mapped_column(ForeignKey("rule_versions.id"))
    rule_version_label: Mapped[str] = mapped_column(String(128))
    facts: Mapped[dict] = mapped_column(JSON)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    trace: Mapped[list] = mapped_column(JSON, default=list)
    flags: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    engine_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    valid_until: Mapped[datetime] = mapped_column(UTCDateTime)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    urgent_ack_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    urgent_ack_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    urgent_ack_note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class AssessmentResult(Base):
    __tablename__ = "assessment_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("assessment_runs.id"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    area_code: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16))
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    decisive: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class CardAccess(Base):
    """Status kartu efektif per pekerja per area (satu baris per pasangan)."""

    __tablename__ = "card_access"
    __table_args__ = (UniqueConstraint("employee_id", "area_code", name="uq_card_access_emp_area"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    area_code: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16))
    source: Mapped[str] = mapped_column(String(16), default="AUTO")  # AUTO / OVERRIDE
    valid_from: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    reason_codes: Mapped[list] = mapped_column(JSON, default=list)
    auto_status: Mapped[str] = mapped_column(String(16))
    auto_reason_codes: Mapped[list] = mapped_column(JSON, default=list)
    auto_valid_from: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    auto_valid_until: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    assessment_result_id: Mapped[int | None] = mapped_column(ForeignKey("assessment_results.id"), nullable=True)
    override_id: Mapped[int | None] = mapped_column(ForeignKey("access_overrides.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    sync_status: Mapped[str] = mapped_column(String(16), default="PENDING")  # PENDING / SYNCED / FAILED
    synced_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class AccessOverride(Base):
    __tablename__ = "access_overrides"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    area_code: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(32), default="OVERRIDE")
    new_status: Mapped[str] = mapped_column(String(16))
    base_auto_status: Mapped[str] = mapped_column(String(16))
    base_reason_codes: Mapped[list] = mapped_column(JSON, default=list)
    valid_from: Mapped[datetime] = mapped_column(UTCDateTime)
    valid_until: Mapped[datetime] = mapped_column(UTCDateTime)
    reason: Mapped[str] = mapped_column(Text)
    risk_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    admin_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    state: Mapped[str] = mapped_column(String(16), default="ACTIVE")
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    ended_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    end_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditLog(Base):
    """Append-only. UPDATE/DELETE diblokir trigger DB; integritas dijaga rantai hash."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_label: Mapped[str] = mapped_column(String(128))
    actor_role: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    employee_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash: Mapped[str] = mapped_column(String(64))


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True, index=True)
    recipient_type: Mapped[str] = mapped_column(String(16))  # WORKER / K3_ONDUTY
    recipient_label: Mapped[str] = mapped_column(String(128))
    channel: Mapped[str] = mapped_column(String(16), default="WHATSAPP")
    provider: Mapped[str] = mapped_column(String(32), default="MOCK_WHATSAPP")
    to_masked: Mapped[str] = mapped_column(String(32))
    template: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="SIMULATED")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    related_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    related_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    area_code: Mapped[str] = mapped_column(String(32))
    location: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AccessEvent(Base):
    """Log tap kartu (simulator / device API)."""

    __tablename__ = "access_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    input_identifier: Mapped[str] = mapped_column(String(64))
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True, index=True)
    employee_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    card_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    room_code: Mapped[str] = mapped_column(String(32))
    room_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    area_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    result: Mapped[str] = mapped_column(String(16))
    reason_category: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(String(255))
    valid_until: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    max_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="SIMULATOR")
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


# --- Mock sistem kontrol akses (vendor). Hanya menyimpan IZIN, tanpa data medis. ---


class AcsCard(Base):
    __tablename__ = "acs_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    employee_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    holder_name: Mapped[str] = mapped_column(String(128))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class AcsCardPermission(Base):
    __tablename__ = "acs_card_permissions"
    __table_args__ = (UniqueConstraint("card_number", "area_code", name="uq_acs_perm_card_area"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    card_number: Mapped[str] = mapped_column(String(32), index=True)
    area_code: Mapped[str] = mapped_column(String(32))
    permission: Mapped[str] = mapped_column(String(16))  # GRANT / TEMPORARY / DENY
    valid_until: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    reason_category: Mapped[str] = mapped_column(String(32))
    max_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class AcsSyncLog(Base):
    __tablename__ = "acs_sync_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16))  # SUCCESS / FAILED
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


# --- RAG -------------------------------------------------------------------------


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    source_file: Mapped[str] = mapped_column(String(255), unique=True)
    category: Mapped[str] = mapped_column(String(64), default="SOP")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer)
    heading: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer, default=0)


class ChatLog(Base):
    """Log audit chatbot: yang disimpan adalah prompt TERSANITASI (yang benar-benar dikirim)."""

    __tablename__ = "chat_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    intent: Mapped[str] = mapped_column(String(32))
    sanitized_question: Mapped[str] = mapped_column(Text)
    personal_context: Mapped[dict] = mapped_column(JSON, default=dict)
    prompt_sent: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider_status: Mapped[str] = mapped_column(String(32))
    answer: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    redactions: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
