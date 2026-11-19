from app.ai.chat import detect_intent
from app.ai.ingest import chunk_markdown
from app.ai.retriever import BM25Index, IndexedChunk
from app.ai.sanitizer import build_personal_context, detect_area, redact


def test_redact_removes_identifiers_and_values():
    q = "Halo, saya Budi Santoso (PTM-1001), email budi@contoh.co.id, HP +62 812-3456-7890. Tensi 160/100 mmHg tgl 2026-11-10, nadi 95 bpm."
    out, counts = redact(q, names=["Budi Santoso", "Budi", "Santoso"], identifiers=["PTM-1001"])
    for leaked in ("Budi", "Santoso", "PTM-1001", "budi@contoh.co.id", "812", "160/100", "2026-11-10", "95 bpm"):
        assert leaked not in out, (leaked, out)
    assert counts["nama"] >= 1 and counts["nilai_tensi"] == 1


def test_date_not_mistaken_for_bp():
    out, counts = redact("MCU saya tanggal 10/11/2026", [], [])
    assert "[tanggal]" in out and "nilai_tensi" not in counts


def test_personal_context_whitelist():
    ctx = build_personal_context(["HYPERTENSION", "OTHER"], "HEIGHT", True)
    assert ctx == {"comorbid_categories": ["hipertensi"], "area": "Ketinggian (HEIGHT)"}
    assert build_personal_context(["HYPERTENSION"], None, False) == {}


def test_intent_and_area_detection():
    assert detect_intent("Kenapa saya tidak bisa masuk area ketinggian?") == ("PERSONAL_STATUS", "HEIGHT")
    assert detect_intent("Apa itu heat stress?")[0] == "GENERAL"
    assert detect_area("kerja di tank farm BBM") == "RESTRICTED_GAS"


def test_chunk_and_bm25():
    md = "# Judul\n\n## Area Ketinggian\n\n" + ("Pekerja dengan tensi tinggi tidak boleh bekerja di ketinggian. " * 3) + \
         "\n\n## Area Panas\n\n" + ("Minum air secara rutin untuk mencegah heat stress di area panas. " * 3)
    chunks = chunk_markdown(md)
    assert len(chunks) == 2 and chunks[0][0] == "Area Ketinggian"
    idx = BM25Index([IndexedChunk(i, 1, "Judul", h, c) for i, (h, c) in enumerate(chunks)])
    top = idx.search("kenapa tensi saya dilarang di ketinggian", k=1)
    assert top and top[0][0].heading == "Area Ketinggian"
