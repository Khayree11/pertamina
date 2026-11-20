from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .constants import VALID_UNITS


import re as _re

_EMAIL_RE = _re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_phone(raw: str) -> str:
    """Nomor Indonesia -> format +62… (dipakai untuk WhatsApp)."""
    digits = _re.sub(r"[^\d+]", "", raw or "")
    if digits.startswith("+"):
        digits = digits[1:]
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    elif digits.startswith("8"):
        digits = "62" + digits
    if not digits.isdigit() or not (10 <= len(digits) <= 15):
        raise ValueError("Nomor telepon tidak valid (contoh: 0812xxxxxxx)")
    return "+" + digits


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=3, max_length=128)
    employee_code: str = Field(min_length=3, max_length=32)
    unit: str = Field(min_length=2, max_length=32)
    phone: str = Field(min_length=9, max_length=20)
    email: str | None = Field(default=None, max_length=128)
    consent: bool = False

    @field_validator("username")
    @classmethod
    def _u(cls, v: str) -> str:
        v = v.strip().lower()
        if not _re.fullmatch(r"[a-z0-9._-]{3,32}", v):
            raise ValueError("Username hanya huruf kecil, angka, titik, garis bawah, atau strip")
        return v

    @field_validator("password")
    @classmethod
    def _p(cls, v: str) -> str:
        if not (_re.search(r"[A-Za-z]", v) and _re.search(r"\d", v)):
            raise ValueError("Password minimal 8 karakter dan memuat huruf serta angka")
        return v

    @field_validator("full_name")
    @classmethod
    def _n(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("employee_code")
    @classmethod
    def _e(cls, v: str) -> str:
        v = v.strip().upper()
        if not _re.fullmatch(r"[A-Z0-9-]{3,32}", v):
            raise ValueError("Employee ID hanya huruf, angka, dan strip")
        return v

    @field_validator("phone")
    @classmethod
    def _ph(cls, v: str) -> str:
        return normalize_phone(v)

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str) -> str:
        v = v.strip()
        if v not in VALID_UNITS:
            raise ValueError(f"Unit harus salah satu dari: {', '.join(VALID_UNITS)}")
        return v

    @field_validator("email")
    @classmethod
    def _em(cls, v: str | None) -> str | None:
        v = (v or "").strip().lower()
        if not v:
            return None
        if not _EMAIL_RE.match(v):
            raise ValueError("Format email tidak valid")
        return v

    @model_validator(mode="after")
    def _c(self):
        if not self.consent:
            raise ValueError("Persetujuan pemrosesan data kesehatan wajib dicentang")
        return self


class GeneralProfileIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=128)
    position: str = Field(min_length=2, max_length=128)
    unit: str = Field(min_length=2, max_length=128)
    work_location: str = Field(min_length=2, max_length=128)
    phone: str = Field(min_length=9, max_length=20)
    email: str | None = Field(default=None, max_length=128)
    birth_date: date
    gender: Literal["L", "P"]
    emergency_contact_name: str = Field(min_length=3, max_length=128)
    emergency_contact_phone: str = Field(min_length=9, max_length=20)

    @field_validator("phone", "emergency_contact_phone")
    @classmethod
    def _ph(cls, v: str) -> str:
        return normalize_phone(v)

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str) -> str:
        v = v.strip()
        if v not in VALID_UNITS:
            raise ValueError(f"Unit harus salah satu dari: {', '.join(VALID_UNITS)}")
        return v

    @field_validator("email")
    @classmethod
    def _em(cls, v: str | None) -> str | None:
        v = (v or "").strip().lower()
        if not v:
            return None
        if not _EMAIL_RE.match(v):
            raise ValueError("Format email tidak valid")
        return v

    @field_validator("birth_date")
    @classmethod
    def _bd(cls, v: date) -> date:
        age = (date.today() - v).days // 365
        if not (17 <= age <= 75):
            raise ValueError("Tanggal lahir tidak wajar untuk usia kerja (17–75 tahun)")
        return v


class WhatsAppSettingsIn(BaseModel):
    provider: Literal["SIMULATION", "META_CLOUD", "GENERIC_HTTP"]
    values: dict[str, str | None] = Field(default_factory=dict)


class WhatsAppTestIn(BaseModel):
    to: str = Field(min_length=9, max_length=20)
    message: str | None = Field(default=None, max_length=500)

    @field_validator("to")
    @classmethod
    def _to(cls, v: str) -> str:
        return normalize_phone(v)


class CreateStaffIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=3, max_length=128)
    role: Literal["HEALTH", "SECURITY"]


class DemoLoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)


class BPIn(BaseModel):
    systolic: int = Field(ge=70, le=250, description="Sistolik (mmHg)")
    diastolic: int = Field(ge=40, le=150, description="Diastolik (mmHg)")
    pulse: int | None = Field(default=None, ge=30, le=200, description="Nadi (bpm)")
    note: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _check(self):
        if self.systolic <= self.diastolic:
            raise ValueError("Sistolik harus lebih besar dari diastolik")
        if self.systolic - self.diastolic < 10:
            raise ValueError("Selisih sistolik dan diastolik terlalu kecil — periksa kembali hasil pengukuran")
        return self


class ComorbidityIn(BaseModel):
    condition_code: str = Field(min_length=2, max_length=32)
    other_label: str | None = Field(default=None, max_length=128)
    controlled: bool = False
    diagnosed_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _check(self):
        if self.condition_code == "OTHER" and not (self.other_label or "").strip():
            raise ValueError("Sebutkan nama kondisi untuk pilihan 'Lainnya'")
        if self.diagnosed_date and self.diagnosed_date > date.today():
            raise ValueError("Tanggal diagnosis tidak boleh di masa depan")
        return self


class ComorbidityUpdateIn(BaseModel):
    controlled: bool | None = None
    active: bool | None = None
    diagnosed_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)
    change_reason: str | None = Field(default=None, max_length=300)


class VerifyIn(BaseModel):
    decision: Literal["VERIFIED", "REJECTED"]
    note: str = Field(min_length=5, max_length=500)
    # Khusus MCU: kesimpulan akhir dokter/admin (wajib bila dokumen belum memuat penilaian).
    conclusion: Literal["FIT", "FIT_WITH_RESTRICTION", "UNFIT"] | None = None
    restricted_areas: list[str] = Field(default_factory=list, max_length=4)


class McuConfirmIn(BaseModel):
    upload_id: str | None = Field(default=None, max_length=32)
    mcu_date: date
    conclusion: Literal["FIT", "FIT_WITH_RESTRICTION", "UNFIT", "PENDING"]
    restricted_areas: list[str] = Field(default_factory=list, max_length=4)
    provider: str = Field(default="", max_length=128)
    doctor_name: str = Field(default="", max_length=128)
    summary: str = Field(default="", max_length=2000)
    details: dict = Field(default_factory=dict)
    confirmed: bool = False


class OverrideIn(BaseModel):
    employee_id: int
    area_code: str
    new_status: Literal["ALLOWED", "RESTRICTED", "DENIED"]
    duration_minutes: int = Field(ge=15, le=24 * 60)
    reason: str = Field(min_length=10, max_length=1000)
    kind: Literal["OVERRIDE", "REVIEW_DECISION"] = "OVERRIDE"
    risk_acknowledged: bool = False


class RevokeIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


class UrgentAckIn(BaseModel):
    note: str = Field(min_length=5, max_length=500)


class RuleVersionIn(BaseModel):
    label: str = Field(min_length=3, max_length=128)
    notes: str | None = Field(default=None, max_length=2000)
    config: dict


class RulePreviewIn(BaseModel):
    config: dict


class RuleActivateIn(BaseModel):
    approved_by_name: str = Field(min_length=3, max_length=128)
    approval_note: str = Field(min_length=5, max_length=2000)


class TapIn(BaseModel):
    identifier: str = Field(min_length=1, max_length=64, description="Employee ID atau nomor kartu")
    room_code: str = Field(min_length=1, max_length=32)


class CardStatusIn(BaseModel):
    card_active: bool
    reason: str = Field(min_length=5, max_length=300)


class OutageIn(BaseModel):
    simulate_outage: bool


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)


class ChatIn(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    personalize: bool = True
    conversation_id: str | None = Field(default=None, max_length=32)
    history: list[ChatTurn] = Field(default_factory=list, max_length=6)

    @field_validator("question")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Pertanyaan terlalu pendek")
        return v
