"""Data demo FIKTIF untuk pitching. Jalankan ulang dari nol:  python -m app.seed --reset

Semua akun demo memakai password DEMO_PASSWORD di bawah (lihat juga README).
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .audit import write_audit
from .config import get_settings
from .constants import ROLE_ADMIN, ROLE_WORKER, UNVERIFIED, VERIFIED
from .models import AnnualMCU, Comorbidity, DailyBPRecord, Employee, Room, RuleVersion, User
from .security import hash_password
from .timeutil import local_at, start_of_local_day, today_local, utcnow

# Default untuk pengembangan lokal; server publik memakai DEMO_PASSWORD acak dari .env.prod.
DEMO_PASSWORD = get_settings().demo_password or "Hbac-Demo-2026"

DEMO_SCENARIOS: dict[str, dict] = {
    "PTM-1001": {"label": "Sehat, MCU valid — BELUM input tensi hari ini (tokoh demo utama)", "today_bp": None},
    "PTM-1002": {"label": "Asma/PPOK terkontrol → Gas/BBM perlu review", "today_bp": (122, 80, 76)},
    "PTM-1003": {"label": "Penyakit jantung + tensi tinggi → Panas & Ketinggian ditolak", "today_bp": (146, 92, 84)},
    "PTM-1004": {"label": "MCU kedaluwarsa (> 12 bulan) → semua area perlu review", "today_bp": (118, 78, 72)},
    "PTM-1005": {"label": "Belum input tensi hari ini (tidak patuh)", "today_bp": None},
    "PTM-1006": {"label": "MCU fit dengan restriksi Ketinggian → akses TEMPORARY", "today_bp": (126, 82, 70)},
    "PTM-1007": {"label": "Diabetes tidak terkontrol + keputusan review admin (Panas)", "today_bp": (128, 84, 80)},
    "PTM-1008": {"label": "Tensi sangat tinggi → semua area ditolak + flag review segera", "today_bp": (184, 112, 96)},
    "PTM-1009": {"label": "MCU diinput mandiri, menunggu verifikasi admin", "today_bp": (120, 76, 74)},
    "PTM-1010": {"label": "Sehat, tensi normal → semua area diizinkan", "today_bp": (116, 76, 68)},
    "PTM-1011": {"label": "Belum input tensi hari ini (tidak patuh)", "today_bp": None},
    "PTM-1012": {"label": "Hipertensi terkontrol (terverifikasi), tensi normal", "today_bp": (132, 84, 74)},
    "admin": {"label": "Admin K3 — monitoring, verifikasi, override, aturan"},
}

# kode, username, nama, jabatan, unit, lokasi, baseline tensi (sis, dia), tingkat kepatuhan
EMPLOYEES = [
    ("PTM-1001", "budi", "Budi Santoso", "Operator Kilang", "Unit Pengolahan (CDU)", "Kilang Unit II", (118, 78), 0.95),
    ("PTM-1002", "siti", "Siti Rahmawati", "Teknisi Instrumen", "Maintenance", "Workshop Instrumen", (120, 79), 0.9),
    ("PTM-1003", "andi", "Andi Wijaya", "Supervisor Tank Farm", "Tank Farm & Distribusi", "Tank Farm Utara", (141, 90), 0.85),
    ("PTM-1004", "dewi", "Dewi Lestari", "Analis Laboratorium", "Laboratorium QC", "Gedung Lab", (116, 76), 0.9),
    ("PTM-1005", "rizky", "Rizky Pratama", "Operator Boiler", "Utilities", "Area Boiler", (124, 80), 0.6),
    ("PTM-1006", "fajar", "Fajar Nugroho", "Rigger / Teknisi Ketinggian", "Maintenance", "Menara Distilasi", (125, 81), 0.9),
    ("PTM-1007", "wulan", "Wulan Sari", "Operator Terminal LNG", "Terminal LNG", "Dermaga LNG", (127, 83), 0.9),
    ("PTM-1008", "teguh", "Teguh Prasetyo", "Operator Pompa BBM", "Tank Farm & Distribusi", "Rumah Pompa BBM", (158, 99), 0.8),
    ("PTM-1009", "rina", "Rina Marlina", "Petugas HSE Lapangan", "HSE", "Kantor HSE", (119, 77), 0.9),
    ("PTM-1010", "joko", "Joko Susilo", "Teknisi Listrik", "Utilities", "Gardu Induk", (115, 75), 0.95),
    ("PTM-1011", "yusuf", "Yusuf Hidayat", "Operator Kilang", "Unit Pengolahan (CDU)", "Kilang Unit I", (121, 79), 0.55),
    ("PTM-1012", "maya", "Maya Anggraini", "Teknisi Mekanik", "Maintenance", "Workshop Mekanik", (131, 84), 0.9),
]
# Hanya akun hasil seed yang boleh dipakai login satu klik — akun yang didaftarkan orang sungguhan tidak pernah.
DEMO_USERNAMES = frozenset({"admin", *(e[1] for e in EMPLOYEES)})

# kode -> list MCU: (hari lalu, kesimpulan, area restriksi, terverifikasi?, ringkasan)
MCU_SPECS: dict[str, list[tuple]] = {
    "PTM-1001": [(120, "FIT", [], True, "Pemeriksaan fisik dalam batas normal. EKG normal. Spirometri normal.")],
    "PTM-1002": [(200, "FIT", [], True, "Spirometri: obstruksi ringan, asma terkontrol dengan inhaler. EKG normal.")],
    "PTM-1003": [(90, "FIT", [], True, "Riwayat penyakit jantung koroner stabil, kontrol rutin ke kardiolog.")],
    "PTM-1004": [(430, "FIT", [], True, "Pemeriksaan fisik dalam batas normal.")],
    "PTM-1005": [(60, "FIT", [], True, "Pemeriksaan fisik dalam batas normal.")],
    "PTM-1006": [(150, "FIT_WITH_RESTRICTION", ["HEIGHT"], True, "Vertigo posisional ringan. Restriksi kerja di ketinggian: maks. 2 jam per entri dengan pendamping.")],
    "PTM-1007": [(100, "FIT", [], True, "Diabetes melitus tipe 2, HbA1c di atas target. Edukasi diet dan kontrol rutin.")],
    "PTM-1008": [(300, "FIT", [], True, "Hipertensi tingkat 1, disarankan kontrol rutin dan modifikasi gaya hidup.")],
    "PTM-1009": [
        (385, "FIT", [], True, "Pemeriksaan fisik dalam batas normal."),
        (10, "FIT", [], False, "MCU tahunan klinik mitra. Hasil dalam batas normal (diinput mandiri oleh pekerja)."),
    ],
    "PTM-1010": [(45, "FIT", [], True, "Pemeriksaan fisik dalam batas normal.")],
    "PTM-1011": [(250, "FIT", [], True, "Pemeriksaan fisik dalam batas normal.")],
    "PTM-1012": [(180, "FIT", [], True, "Hipertensi terkontrol dengan terapi dari dokter. EKG normal.")],
}

# kode -> list komorbid: (kode, terkontrol, tanggal diagnosis)
COMORBID_SPECS: dict[str, list[tuple]] = {
    "PTM-1002": [("ASTHMA_COPD", True, date(2015, 3, 1))],
    "PTM-1003": [("HEART_DISEASE", True, date(2021, 6, 10))],
    "PTM-1007": [("DIABETES", False, date(2019, 9, 2))],
    "PTM-1008": [("HYPERTENSION", False, date(2023, 1, 16))],
    "PTM-1012": [("HYPERTENSION", True, date(2020, 11, 5))],
}

ROOMS = [
    ("GEN-GATE-01", "Gerbang Utama", "GENERAL", "Pos Satpam Utama", "Akses umum"),
    ("GEN-OFF-01", "Gedung Kantor Operasi", "GENERAL", "Area Kantor", "Akses umum"),
    ("COLD-01", "Cold Room Penyimpanan Sampel", "COLD", "Gedung Lab", "Contoh area dingin"),
    ("COLD-02", "Area Kriogenik Terminal LNG", "COLD", "Dermaga LNG", "Contoh area dingin (kriogenik)"),
    ("HOT-01", "Ruang Boiler Utilities", "HOT", "Area Boiler", "Contoh area panas"),
    ("HOT-02", "Area Furnace Unit CDU", "HOT", "Kilang Unit II", "Contoh area panas"),
    ("HGT-01", "Platform Menara Distilasi", "HEIGHT", "Menara Distilasi", "Contoh area ketinggian"),
    ("HGT-02", "Scaffolding Tangki Timbun", "HEIGHT", "Tank Farm Utara", "Contoh area ketinggian"),
    ("GAS-01", "Tank Farm BBM", "RESTRICTED_GAS", "Tank Farm Utara", "Contoh area terbatas gas/uap BBM"),
    ("GAS-02", "Rumah Pompa BBM (confined space)", "RESTRICTED_GAS", "Rumah Pompa BBM", "Contoh area terbatas gas/uap BBM"),
]


def _measured_at(day: date, now: datetime, rng: random.Random) -> datetime:
    t = local_at(day, 6, 20 + rng.randint(0, 70))
    if day == today_local(now) and t > now:
        t = max(start_of_local_day(day), now - timedelta(minutes=2))
    return t


def load_default_rules() -> dict:
    return json.loads((Path(__file__).parent / "rules" / "default_rules.json").read_text(encoding="utf-8"))


def seed_all(db: Session) -> dict:
    from .services import acs, notifications
    from .services.assessment import run_assessment
    from .services.overrides import create_override

    rng = random.Random(2026)
    now = utcnow()
    today = today_local(now)
    pw = hash_password(DEMO_PASSWORD)

    rules = load_default_rules()
    db.add(
        RuleVersion(
            version=1,
            label=rules["label"],
            config=rules,
            status="ACTIVE",
            notes="Versi awal dari tabel aturan ilustratif dokumen perencanaan §5, ditambah aturan default aman.",
            created_at=now,
            activated_at=now,
            approved_by_name="BELUM DIVALIDASI — simulasi prototipe",
            approval_note="Aturan contoh. Wajib divalidasi dokter perusahaan & pemilik kebijakan K3 sebelum produksi.",
        )
    )
    for code, name, area, loc, desc in ROOMS:
        db.add(Room(room_code=code, name=name, area_code=area, location=loc, description=desc))

    admin = User(username="admin", password_hash=pw, role=ROLE_ADMIN, full_name="Nadia Putri (Admin K3)")
    db.add(admin)
    db.flush()

    employees: dict[str, Employee] = {}
    for i, (code, uname, name, pos, unit, loc, base, compliance) in enumerate(EMPLOYEES):
        num = code.split("-")[1]
        emp = Employee(
            employee_code=code,
            full_name=name,
            position=pos,
            unit=unit,
            work_location=loc,
            phone=f"+62812000{num}",
            card_number=f"CARD-{int(num):07d}",
            card_active=True,
            created_at=now - timedelta(days=400),
            birth_date=date(1975 + (i * 3) % 25, 1 + i % 12, 5 + i),
            gender="P" if uname in ("siti", "dewi", "wulan", "rina", "maya") else "L",
            emergency_contact_name=f"Keluarga {name.split()[0]} (fiktif)",
            emergency_contact_phone=f"+62813000{num}",
            registration_source="ADMIN",
            profile_general_done_at=now - timedelta(days=400),
            comorbid_declared_at=now - timedelta(days=400),
            profile_completed_at=now - timedelta(days=400),
        )
        db.add(emp)
        db.flush()
        user = User(username=uname, password_hash=pw, role=ROLE_WORKER, full_name=name, employee_id=emp.id)
        db.add(user)
        db.flush()
        employees[code] = emp

        # Riwayat tensi 20 hari terakhir (tanpa hari ini).
        for back in range(20, 0, -1):
            day = today - timedelta(days=back)
            if rng.random() > compliance:
                continue
            s = base[0] + rng.randint(-7, 7)
            d = base[1] + rng.randint(-5, 5)
            db.add(
                DailyBPRecord(
                    employee_id=emp.id,
                    record_date=day,
                    measured_at=_measured_at(day, now, rng),
                    systolic=s,
                    diastolic=min(d, s - 25),
                    pulse=rng.randint(64, 88),
                    source="SELF",
                    entered_by_user_id=user.id,
                    created_at=now,
                )
            )
        tb = DEMO_SCENARIOS[code]["today_bp"]
        if tb:
            db.add(
                DailyBPRecord(
                    employee_id=emp.id,
                    record_date=today,
                    measured_at=_measured_at(today, now, rng),
                    systolic=tb[0],
                    diastolic=tb[1],
                    pulse=tb[2],
                    source="SELF",
                    entered_by_user_id=user.id,
                    created_at=now,
                )
            )

        for days_ago, conclusion, areas, verified, summary in MCU_SPECS.get(code, []):
            db.add(
                AnnualMCU(
                    employee_id=emp.id,
                    mcu_date=today - timedelta(days=days_ago),
                    provider="Klinik Perusahaan (contoh)" if verified else "Klinik Mitra Sehat (contoh)",
                    summary=summary,
                    conclusion=conclusion,
                    restricted_areas=areas,
                    doctor_name="dr. Contoh, Sp.KO (fiktif)",
                    verification_status=VERIFIED if verified else UNVERIFIED,
                    verified_by_user_id=admin.id if verified else None,
                    verified_at=now - timedelta(days=max(days_ago - 2, 0)) if verified else None,
                    verification_note="Diverifikasi dari hasil klinik perusahaan" if verified else None,
                    entered_by_user_id=admin.id if verified else user.id,
                    created_at=now - timedelta(days=days_ago),
                )
            )
        for ccode, controlled, diag in COMORBID_SPECS.get(code, []):
            db.add(
                Comorbidity(
                    employee_id=emp.id,
                    condition_code=ccode,
                    controlled=controlled,
                    diagnosed_date=diag,
                    active=True,
                    verification_status=VERIFIED,
                    verified_by_user_id=admin.id,
                    verified_at=now - timedelta(days=30),
                    verification_note="Sesuai rekam medis klinik perusahaan",
                    entered_by_user_id=admin.id,
                    created_at=now - timedelta(days=200),
                    updated_at=now - timedelta(days=30),
                )
            )
    db.flush()
    write_audit(db, None, "DEMO_SEED", "system", None, None, {"employees": len(employees), "note": "Data fiktif untuk demo"})

    for emp in employees.values():
        run_assessment(db, emp, "SEED", notify=True, now=now)

    # Keputusan review admin yang masih aktif (override sementara) untuk Wulan — area Panas.
    create_override(
        db,
        admin,
        employees["PTM-1007"],
        "HOT",
        "ALLOWED",
        240,
        "Review dr. perusahaan: gula darah sewaktu terkontrol hari ini. Izin 4 jam dengan pendamping dan istirahat hidrasi tiap jam.",
        kind="REVIEW_DECISION",
        risk_acknowledged=True,
        now=now,
    )
    notifications.send_bp_reminders(db, now)

    # Contoh riwayat tap kartu hari ini (dari reader simulasi).
    for code, room, dev in [
        ("PTM-1010", "HGT-01", "READER-HGT-01"),
        ("PTM-1003", "HOT-01", "READER-HOT-01"),
        ("PTM-1006", "HGT-01", "READER-HGT-01"),
        ("PTM-1005", "GAS-01", "READER-GAS-01"),
        ("PTM-1007", "HOT-01", "READER-HOT-01"),
        ("PTM-1008", "GAS-02", "READER-GAS-02"),
    ]:
        acs.tap(db, employees[code].card_number, room, source="DEVICE_API", device_id=dev, now=now)
    db.flush()
    return {"employees": len(employees)}


def refresh_demo_day(db: Session, now: datetime | None = None) -> int:
    """DEMO_MODE: isi tensi hari ini untuk pekerja skenario agar dashboard tetap bermakna di hari berikutnya.
    Tokoh demo (PTM-1001) dan pekerja 'tidak patuh' sengaja tidak diisi."""
    from .services.assessment import run_assessment
    from .services.facts import todays_bp

    now = now or utcnow()
    today = today_local(now)
    rng = random.Random(today.toordinal())
    n = 0
    for code, sc in DEMO_SCENARIOS.items():
        tb = sc.get("today_bp")
        if not tb:
            continue
        emp = db.scalars(select(Employee).where(Employee.employee_code == code)).first()
        if emp is None or todays_bp(db, emp.id, today):
            continue
        db.add(
            DailyBPRecord(
                employee_id=emp.id,
                record_date=today,
                measured_at=_measured_at(today, now, rng),
                systolic=tb[0],
                diastolic=tb[1],
                pulse=tb[2],
                source="DEMO_SIM",
                note="Dibuat otomatis oleh mode demo",
                created_at=now,
            )
        )
        db.flush()
        run_assessment(db, emp, "DEMO_REFRESH", notify=True, now=now)
        n += 1
    return n


def reset_database() -> None:
    from .db import Base, engine

    s = get_settings()
    Base.metadata.drop_all(engine)
    shutil.rmtree(s.upload_dir / "mcu", ignore_errors=True)
    Base.metadata.create_all(engine)


def main() -> None:
    from . import audit  # noqa: F401  (mendaftarkan trigger append-only)
    from .ai.ingest import ingest_directory
    from .db import WRITE_LOCK, Base, SessionLocal, engine

    parser = argparse.ArgumentParser(description="Seed data demo HBAC")
    parser.add_argument("--reset", action="store_true", help="Hapus semua tabel lalu isi ulang data demo")
    args = parser.parse_args()
    s = get_settings()
    Path(s.data_dir).mkdir(parents=True, exist_ok=True)
    if args.reset:
        reset_database()
    else:
        Base.metadata.create_all(engine)
    with WRITE_LOCK, SessionLocal() as db:
        if db.scalar(select(func.count(User.id))):
            print("Database sudah berisi data. Gunakan --reset untuk mengisi ulang dari nol.")
            return
        seed_all(db)
        ingest_directory(db, s.knowledge_dir)
        db.commit()
    print(f"Seed selesai. Password semua akun demo: lihat DEMO_PASSWORD di {Path(__file__).name} / README.")


if __name__ == "__main__":
    main()
