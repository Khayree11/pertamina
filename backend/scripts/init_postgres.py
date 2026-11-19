"""Siapkan database PostgreSQL lokal untuk HBAC (cukup sekali).

Membuat role `hbac` (password acak) + database `hbac` dan `hbac_test`, lalu menulis
DATABASE_URL & TEST_DATABASE_URL ke backend/.env.

Password superuser PostgreSQL diminta lewat prompt tersembunyi dan TIDAK disimpan.

    backend\\.venv\\Scripts\\python.exe backend\\scripts\\init_postgres.py
"""
from __future__ import annotations

import argparse
import getpass
import secrets
import string
import sys
from pathlib import Path

import psycopg
from psycopg import sql

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
ROLE = "hbac"
DATABASES = ["hbac", "hbac_test"]


def write_env(values: dict[str, str]) -> None:
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    seen: set[str] = set()
    out = []
    for line in lines:
        key = line.split("=", 1)[0].strip()
        if key in values:
            out.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            out.append(line)
    for k, v in values.items():
        if k not in seen:
            out.append(f"{k}={v}")
    ENV_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Inisialisasi PostgreSQL untuk HBAC")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5432)
    ap.add_argument("--superuser", default="postgres")
    args = ap.parse_args()

    print("Klik di dalam terminal ini, ketik password superuser PostgreSQL, lalu tekan Enter.")
    print("(Karakter yang diketik memang TIDAK tampil. Password tidak disimpan.)")
    admin_pw = getpass.getpass(f"Password '{args.superuser}': ")
    print("Menghubungkan ke PostgreSQL...")
    app_pw = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(28))
    try:
        with psycopg.connect(
            host=args.host, port=args.port, user=args.superuser, password=admin_pw, dbname="postgres", autocommit=True
        ) as conn:
            exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (ROLE,)).fetchone()
            stmt = "ALTER ROLE {} WITH LOGIN PASSWORD {}" if exists else "CREATE ROLE {} LOGIN PASSWORD {}"
            conn.execute(sql.SQL(stmt).format(sql.Identifier(ROLE), sql.Literal(app_pw)))
            for db in DATABASES:
                if conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db,)).fetchone():
                    conn.execute(sql.SQL("ALTER DATABASE {} OWNER TO {}").format(sql.Identifier(db), sql.Identifier(ROLE)))
                else:
                    conn.execute(
                        sql.SQL("CREATE DATABASE {} OWNER {} ENCODING 'UTF8' TEMPLATE template0").format(
                            sql.Identifier(db), sql.Identifier(ROLE)
                        )
                    )
    except psycopg.OperationalError as exc:
        print(f"\nGagal terhubung sebagai '{args.superuser}': {exc}".strip())
        return 1

    for db in DATABASES:
        with psycopg.connect(host=args.host, port=args.port, user=ROLE, password=app_pw, dbname=db) as c:
            c.execute("SELECT 1")

    base = f"postgresql+psycopg://{ROLE}:{app_pw}@{args.host}:{args.port}"
    write_env({"DATABASE_URL": f"{base}/hbac", "TEST_DATABASE_URL": f"{base}/hbac_test"})
    print(f"\nSelesai. Role '{ROLE}', database {', '.join(DATABASES)} siap. Koneksi ditulis ke {ENV_PATH}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
