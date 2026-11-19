"""Pembacaan MCU otomatis (PDF FIKTIF berformat 'Kesimpulan Medical Check Up') + memori percakapan asisten."""
from app.mcu.parser import diff_fields, map_assessment, parse_text
from app.mcu.template import statuses

FAKE_LINES = [
    "KESIMPULAN MEDICAL CHECK UP",
    "Perusahaan : PT Contoh Energi Nusantara",
    "NIK : 3201010101900001 Nama : Budi Santoso (L)",
    "Dept/Bagian : UNIT PENGOLAHAN Tanggal Lahir : 05/01/1975 (51 Thn)",
    "Tanggal MCU : 01/09/2026 No. MCU : 26090100001",
    "Kesimpulan dan Saran",
    "Penilaian",
    "-",
    "Kesimpulan",
    "Riwayat Alergi : Tidak ada",
    "Normoweight (Body Mass Index : 21.4)",
    "Hipertensi Grade I ( 145/93)",
    "Skor Self Reporting Questionnaire (SRQ) : Normal",
    "Pemeriksaan Napfa : Total Skor dan Keterangan : 20(baik)",
    "Skor Kardiovaskular : 2(risiko sedang)",
    "Romberg Test : Negatif",
    "Pemeriksaan Laboratorium :",
    "- Hemoglobin rendah (11.2)",
    "- Kimia Darah : Dalam Batas Normal",
    "- Urinalisa : Dalam Batas Normal",
    "Pemeriksaan Non Laboratorium :",
    "- EKG : Dalam Batas Normal",
    "- Spirometri : Restriktif Ringan",
    "- Rontgen : Dalam Batas Normal",
    "Saran",
    "Diet rendah garam dan kontrol tekanan darah",
    "secara berkala.",
    "Catatan",
    "Lakukan pemeriksaan kesehatan berkala setiap 1 tahun sekali.",
    "08 September 2026",
    "Validasi Oleh,",
    "dr. Contoh Pemeriksa",
    "Dokter Pemeriksa",
]


def make_pdf(lines: list[str]) -> bytes:
    """PDF teks minimal (Helvetica) tanpa dependensi tambahan."""
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    content = "BT /F1 10 Tf 40 800 Td 14 TL " + " ".join(f"({esc(ln)}) Tj T*" for ln in lines) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


def test_parse_text_template():
    res = parse_text("\n".join(FAKE_LINES))
    v = res["values"]
    assert res["recognized"] and v["bmi"] == 21.4 and v["bp_systolic"] == 145 and v["bp_diastolic"] == 93
    assert v["nik_masked"].endswith("0001") and "3201010101" not in v["nik_masked"]
    assert v["spirometri"] == "Restriktif Ringan" and v["lab_other"] == ["Hemoglobin rendah (11.2)"]
    assert v["doctor_name"] == "dr. Contoh Pemeriksa" and v["validation_date"] == "2026-09-08"
    assert v["advice"] == "Diet rendah garam dan kontrol tekanan darah secara berkala."
    # Tanggal validasi dokter tidak boleh ikut terbaca sebagai bagian catatan.
    assert v["notes"] == "Lakukan pemeriksaan kesehatan berkala setiap 1 tahun sekali."
    st = statuses(v)
    assert st["bp_systolic"] == "PERHATIAN" and st["spirometri"] == "PERHATIAN" and st["ekg"] == "NORMAL"
    assert map_assessment(v["assessment"]) == "PENDING" and map_assessment("Fit with note") == "FIT"
    assert diff_fields(v, {**v, "bmi": 22}) == ["bmi"]


def test_extract_confirm_and_verify_flow(client, login):
    login("budi")
    r = client.post("/api/me/mcu/extract", files={"file": ("mcu.pdf", make_pdf(FAKE_LINES), "application/pdf")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "AUTO_PDF" and d["found_count"] >= 20
    assert d["identity"] == {"name_match": True, "birth_date_match": True}
    assert d["suggested"]["conclusion"] == "PENDING" and d["suggested"]["mcu_date"] == "2026-09-01"
    assert {s["code"] for s in d["suggestions"]} >= {"BP", "SPIRO"}

    details = {**d["values"], "bp_systolic": 150}
    body = {"upload_id": d["upload_id"], "mcu_date": "2026-09-01", "conclusion": "PENDING", "details": details, "confirmed": False}
    assert client.post("/api/me/mcu/confirm", json=body).status_code == 400
    r = client.post("/api/me/mcu/confirm", json={**body, "confirmed": True})
    assert r.status_code == 200, r.text
    item = r.json()["item"]
    assert item["edited_fields"] == ["bp_systolic"] and item["extracted_values"]["bp_systolic"] == 145
    assert item["conclusion"] == "PENDING" and item["verification_status"] == "UNVERIFIED" and item["has_document"]
    assert item["details"]["nik_masked"].endswith("0001")
    assert all(c["status"] != "ALLOWED" for c in r.json()["card"])
    assert client.post("/api/me/mcu/confirm", json={**body, "confirmed": True}).status_code == 400  # upload sekali pakai

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    img = client.post("/api/me/mcu/extract", files={"file": ("mcu.png", png, "image/png")}).json()
    assert img["status"] == "IMAGE_NO_OCR" and img["found_count"] == 0

    login("admin")
    r = client.post(f"/api/admin/mcu/{item['id']}/verify", json={"decision": "VERIFIED", "note": "Sesuai dokumen asli"})
    assert r.status_code == 400  # wajib menetapkan kesimpulan akhir
    r = client.post(
        f"/api/admin/mcu/{item['id']}/verify",
        json={"decision": "VERIFIED", "note": "Sesuai dokumen asli", "conclusion": "FIT_WITH_RESTRICTION", "restricted_areas": ["RESTRICTED_GAS"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["item"]["conclusion"] == "FIT_WITH_RESTRICTION"


def test_chat_memory_persists(client, login):
    login("joko")
    first = client.post("/api/chat", json={"question": "halo"}).json()
    cid = first["conversation_id"]
    again = client.post("/api/chat", json={"question": "terima kasih", "conversation_id": cid}).json()
    assert again["conversation_id"] == cid and again["sent_to_ai"]["history_turns"] == 2
    latest = client.get("/api/chat/conversations/latest").json()["conversation"]
    assert latest["id"] == cid and [m["role"] for m in latest["messages"]] == ["user", "assistant", "user", "assistant"]
    assert latest["messages"][0]["content"] == "halo" and latest["title"] == "halo"
    assert latest["messages"][1]["meta"]["basis"] == "CONVERSATION"

    new = client.post("/api/chat/conversations").json()["conversation"]
    assert new["id"] != cid and client.get("/api/chat/conversations/latest").json()["conversation"]["id"] == new["id"]
    assert len(client.get("/api/chat/conversations").json()["items"]) >= 2

    login("budi")
    assert client.get(f"/api/chat/conversations/{cid}").status_code == 404  # bukan milik budi
    login("joko")
    assert client.delete(f"/api/chat/conversations/{cid}").status_code == 200
    assert client.get(f"/api/chat/conversations/{cid}").status_code == 404


def test_citations_cleaned_and_followup_keeps_topic(client, login):
    from app.ai.chat import clean_citations, strip_citations

    # Rujukan gabungan dipecah; nomor yang tidak ada di konteks giliran ini dibuang.
    assert clean_citations("Minum air [2, 4]. Istirahat [5].", 4) == "Minum air [2][4]. Istirahat."
    assert strip_citations("Minum air [2][4] dan istirahat [1, 3].") == "Minum air dan istirahat."

    login("joko")
    first = client.post("/api/chat", json={"question": "Tips mencegah dehidrasi saat kerja di area panas?"}).json()
    follow = client.post(
        "/api/chat",
        json={"question": "Ringkas jawabanmu tadi jadi 3 poin singkat saja", "conversation_id": first["conversation_id"]},
    ).json()
    first_docs = {s["document_id"] for s in first["sources"]}
    # Pertanyaan lanjutan tanpa kata kunci tetap mendapat dokumen dari topik sebelumnya.
    assert first_docs and first_docs & {s["document_id"] for s in follow["sources"]}


def test_ai_gets_memory_without_stale_citations(client, login, monkeypatch):
    from app.ai import chat as chat_mod
    from app.ai.gemini import GenerationResult

    seen = {}

    def fake_generate(system, prompt, history=None, **kw):
        seen["history"] = history
        text = "Anda bertanya tentang dehidrasi di area panas." if "Tadi saya" in prompt else "Minum air sedikit tapi sering [1, 9]."
        return GenerationResult(ok=True, text=text, model="uji-model")

    monkeypatch.setattr(chat_mod.gemini, "generate", fake_generate)
    login("joko")
    first = client.post("/api/chat", json={"question": "Tips mencegah dehidrasi saat kerja di area panas?"}).json()
    assert first["answer"] == "Minum air sedikit tapi sering [1]." and first["basis"] == "DOCUMENTS"
    again = client.post(
        "/api/chat", json={"question": "Tadi saya bertanya tentang apa?", "conversation_id": first["conversation_id"]}
    ).json()
    # Riwayat dikirim ke AI (memori), tanpa nomor rujukan lama.
    assert seen["history"][-2:] == [
        ("user", "Tips mencegah dehidrasi saat kerja di area panas?"),
        ("assistant", "Minum air sedikit tapi sering."),
    ]
    assert again["basis"] == "CONVERSATION"
