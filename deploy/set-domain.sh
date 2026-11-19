#!/usr/bin/env bash
# Pakai domain + HTTPS otomatis (Let's Encrypt):  bash deploy/set-domain.sh hbac.webelong.id
# Kembali ke IP saja (HTTP):                      bash deploy/set-domain.sh --ip
# Syarat domain: A record domain itu sudah mengarah ke IP VPS ini.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f .env.prod ] || { echo ".env.prod belum ada - jalankan deploy/install.sh dulu."; exit 1; }
ARG="${1:-}"
[ -n "$ARG" ] || { echo "Contoh: bash deploy/set-domain.sh hbac.webelong.id"; exit 1; }

setv() {
  if grep -q "^$1=" .env.prod; then sed -i "s|^$1=.*|$1=$2|" .env.prod; else echo "$1=$2" >> .env.prod; fi
}
IPS="$(hostname -I 2>/dev/null || true)"

if [ "$ARG" = "--ip" ]; then
  IP="$(echo "$IPS" | awk '{print $1}')"
  setv SITE_ADDRESS ":80"
  setv PUBLIC_URL "http://$IP"
  setv COOKIE_SECURE false
else
  DOMAIN="$(printf '%s' "$ARG" | sed -E 's#^https?://##; s#/.*$##')"
  RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')" || RESOLVED=""
  if [ -z "$RESOLVED" ] || ! echo "$IPS" | tr ' ' '\n' | grep -x "$RESOLVED" >/dev/null; then
    echo "!! $DOMAIN belum mengarah ke server ini (IP server: $IPS; DNS sekarang: ${RESOLVED:-tidak ditemukan})."
    echo "   Tambahkan A record $DOMAIN -> IP VPS di pengaturan DNS domain, tunggu 5-30 menit, lalu ulangi."
    exit 1
  fi
  setv SITE_ADDRESS "$DOMAIN"
  setv PUBLIC_URL "https://$DOMAIN"
  setv COOKIE_SECURE true
fi

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
echo "Selesai. Buka: $(grep '^PUBLIC_URL=' .env.prod | cut -d= -f2-)"
echo "(Untuk domain baru, sertifikat HTTPS dibuat otomatis dalam sekitar 1 menit.)"
