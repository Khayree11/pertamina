#!/usr/bin/env bash
# Backup database + berkas unggahan (dokumen MCU) ke /root/hbac-backups. Dijalankan otomatis tiap malam oleh cron.
# Unduh sesekali ke komputer Anda (dari PowerShell):  scp -r root@IP_VPS:/root/hbac-backups .
# Pulihkan database: docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
#                      pg_restore -U hbac -d hbac --clean --if-exists < /root/hbac-backups/db-XXXX.dump
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${BACKUP_DIR:-/root/hbac-backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
umask 077
mkdir -p "$OUT"
TS="$(date +%Y%m%d-%H%M)"
"${COMPOSE[@]}" exec -T db pg_dump -U hbac -d hbac -Fc > "$OUT/db-$TS.dump"
"${COMPOSE[@]}" exec -T backend tar -czf - -C /app/data . > "$OUT/data-$TS.tar.gz"
find "$OUT" -type f \( -name 'db-*.dump' -o -name 'data-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') backup OK: db-$TS.dump ($(du -h "$OUT/db-$TS.dump" | cut -f1)), data-$TS.tar.gz ($(du -h "$OUT/data-$TS.tar.gz" | cut -f1))"
