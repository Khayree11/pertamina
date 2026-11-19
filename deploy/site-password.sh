#!/usr/bin/env bash
# Kunci seluruh situs dengan username & password (basic auth di Caddy).
#   bash deploy/site-password.sh          buat / ganti password situs
#   bash deploy/site-password.sh --off    hapus kunci
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p .caddy
FILE=.caddy/basic_auth.caddy
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

restart_caddy() {
  if [ -f .env.prod ] && "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -x caddy >/dev/null; then
    "${COMPOSE[@]}" restart caddy >/dev/null
  fi
}

case "${1:-}" in
  --off)
    rm -f "$FILE"
    touch .caddy/.no-auth
    restart_caddy
    echo "    Kunci situs dihapus."
    exit 0
    ;;
  --ask)
    DEF="${2:-Y}"
    if [ "$DEF" = "Y" ]; then HINT="Y/n"; else HINT="y/N"; fi
    read -rp "    Kunci seluruh situs dengan username & password (disarankan selama mode demo)? [$HINT]: " ANS || true
    if [[ ! "${ANS:-$DEF}" =~ ^[Yy] ]]; then
      touch .caddy/.no-auth
      echo "    Situs tanpa password tambahan."
      exit 0
    fi
    ;;
esac

read -rp "    Username situs [hbac]: " USERNAME || true
USERNAME="${USERNAME:-hbac}"
while :; do
  read -rsp "    Password situs (min. 8 karakter, karakter tidak tampil saat diketik): " PASSWORD
  echo
  [ "${#PASSWORD}" -ge 8 ] && break
  echo "    Terlalu pendek, ulangi."
done
HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$PASSWORD")"
[[ "$HASH" == \$2* ]] || { echo "Gagal membuat hash password."; exit 1; }
umask 077
printf 'basic_auth {\n\t%s %s\n}\n' "$USERNAME" "$HASH" > "$FILE"
rm -f .caddy/.no-auth
restart_caddy
echo "    Situs dikunci. Username: $USERNAME"
