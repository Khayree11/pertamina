"""Migrasi aditif ringan: menambah kolom baru (nullable) ke tabel yang sudah ada.

Cukup untuk prototipe (SQLite & PostgreSQL). Untuk produksi gunakan Alembic.
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .db import Base

logger = logging.getLogger("hbac.migrate")


def ensure_columns(engine: Engine) -> list[str]:
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    added: list[str] = []
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in cols:
                    continue
                if not col.nullable and col.server_default is None:
                    logger.warning("Kolom %s.%s wajib tetapi belum ada — jalankan seed --reset", table.name, col.name)
                    continue
                ddl = f'ALTER TABLE {table.name} ADD COLUMN {col.name} {col.type.compile(dialect=engine.dialect)}'
                conn.execute(text(ddl))
                added.append(f"{table.name}.{col.name}")
    if added:
        logger.info("Kolom baru ditambahkan: %s", ", ".join(added))
    return added
