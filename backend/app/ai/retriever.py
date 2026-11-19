"""Retriever BM25 lokal (penyimpanan lokal sederhana, §6).

Dokumen tidak perlu dikirim ke layanan eksternal untuk diindeks. Antarmuka `search()`
sengaja sederhana agar bisa diganti dense retriever (mis. pgvector + embedding) nanti.
"""
from __future__ import annotations

import math
import re
import threading
from collections import Counter
from dataclasses import dataclass

STOPWORDS = set(
    """
    yang dan di ke dari ini itu untuk dengan pada adalah atau juga tidak akan dalam bisa dapat oleh
    sebagai saat jika agar bila maka karena tersebut ada saya kami kita anda kamu aku mereka dia ia
    apa apakah bagaimana mengapa kenapa kapan dimana mana siapa berapa harus perlu sudah belum masih
    lagi telah sedang hanya serta tentang secara setiap para hal lebih kurang sangat banyak beberapa
    pun lah kah nya per the a an of to is are be for on in
    """.split()
)

# Ekspansi sinonim sederhana (Indonesia <-> kode area / istilah teknis).
SYNONYMS = {
    "tensi": ["tekanan", "darah", "sistolik", "diastolik"],
    "darah": ["tensi"],
    "ketinggian": ["height", "tinggi", "jatuh"],
    "tinggi": ["ketinggian", "height"],
    "height": ["ketinggian"],
    "panas": ["hot", "heat", "suhu"],
    "hot": ["panas"],
    "dingin": ["cold", "suhu"],
    "cold": ["dingin"],
    "gas": ["bbm", "uap", "restricted_gas", "terbatas"],
    "bbm": ["gas", "uap", "restricted_gas"],
    "kartu": ["akses", "tap"],
    "akses": ["kartu", "izin", "syarat"],
    "masuk": ["memasuki", "akses", "syarat", "ditolak", "ambang"],
    "boleh": ["syarat", "izin", "akses"],
    "dilarang": ["ditolak", "syarat"],
    "ditolak": ["denied"],
    "denied": ["ditolak"],
    "review": ["needs_review", "tinjau"],
    "mcu": ["medical", "checkup", "tahunan"],
    "komorbid": ["penyakit", "penyerta", "riwayat"],
    "jantung": ["kardiovaskular", "heart"],
    "asma": ["ppok", "paru", "respirasi"],
    "ppok": ["asma", "paru"],
    "hipertensi": ["tensi", "tekanan"],
    "diabetes": ["gula"],
    "override": ["admin", "sementara"],
    "privasi": ["data", "pribadi", "pdp"],
}

_TOKEN_RE = re.compile(r"[a-z0-9_]+")


def _normalize(tok: str) -> str:
    for suf in ("nya", "lah", "kah"):
        if tok.endswith(suf) and len(tok) > len(suf) + 3:
            return tok[: -len(suf)]
    return tok


def tokenize(text: str) -> list[str]:
    toks = [_normalize(t) for t in _TOKEN_RE.findall((text or "").lower())]
    return [t for t in toks if len(t) > 1 and t not in STOPWORDS]


def expand_query(tokens: list[str]) -> list[str]:
    out = list(tokens)
    for t in tokens:
        out.extend(SYNONYMS.get(t, []))
    return out


@dataclass
class IndexedChunk:
    chunk_id: int
    document_id: int
    document_title: str
    heading: str
    content: str


class BM25Index:
    def __init__(self, chunks: list[IndexedChunk], k1: float = 1.4, b: float = 0.75):
        self.chunks = chunks
        self.k1, self.b = k1, b
        self.tfs: list[Counter] = []
        self.lengths: list[int] = []
        df: Counter = Counter()
        for c in chunks:
            # Judul & heading diberi bobot ganda.
            toks = tokenize(c.content) + tokenize(c.heading) * 2 + tokenize(c.document_title)
            tf = Counter(toks)
            self.tfs.append(tf)
            self.lengths.append(len(toks))
            df.update(tf.keys())
        self.n = len(chunks)
        self.avgdl = (sum(self.lengths) / self.n) if self.n else 0.0
        self.idf = {t: math.log(1 + (self.n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def search(self, query: str, k: int = 4) -> list[tuple[IndexedChunk, float]]:
        if not self.n:
            return []
        q = expand_query(tokenize(query))
        if not q:
            return []
        qtf = Counter(q)
        scores = []
        for i, tf in enumerate(self.tfs):
            s = 0.0
            dl = self.lengths[i] or 1
            for term, qw in qtf.items():
                f = tf.get(term)
                if not f:
                    continue
                idf = self.idf.get(term, 0.0)
                denom = f + self.k1 * (1 - self.b + self.b * dl / (self.avgdl or 1))
                s += idf * (f * (self.k1 + 1)) / denom * (1.0 if qw == 1 else 1.0 + 0.3 * (qw - 1))
            if s > 0:
                scores.append((i, s))
        scores.sort(key=lambda x: x[1], reverse=True)
        return [(self.chunks[i], s) for i, s in scores[:k]]


_index_lock = threading.Lock()
_index: BM25Index | None = None


def set_index(index: BM25Index) -> None:
    global _index
    with _index_lock:
        _index = index


def get_index() -> BM25Index:
    with _index_lock:
        return _index or BM25Index([])
