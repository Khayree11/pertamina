#!/usr/bin/env bash
# Instalasi & update HBAC di VPS Ubuntu 22.04/24.04. Jalankan sebagai root:
#   bash /root/hbac/deploy/install.sh
# Aman dijalankan ulang: langkah yang sudah selesai dilewati.
# Update kode: unggah paket baru, ekstrak ke /root/hbac, lalu jalankan skrip ini lagi.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!!\033[0m %s\n' "$*"; }
envget() { grep -E "^$1=" .env.prod | head -1 | cut -d= -f2- || true; }

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root (ketik: sudo -i, lalu ulangi)."; exit 1; }
[ -f docker-compose.prod.yml ] || { echo "docker-compose.prod.yml tidak ada di $APP_DIR"; exit 1; }

# ---------------------------------------------------------------------------------------------
step "1/6 Swap 2 GB (memori cadangan agar build tidak gagal di RAM 2 GB)"
if [ "$(swapon --noheadings --show | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  if swapon /swapfile; then
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-hbac.conf
    sysctl -q -p /etc/sysctl.d/99-hbac.conf || true
    ok "swap 2 GB aktif"
  else
    warn "swap tidak bisa diaktifkan di VPS ini - build tetap dicoba"
  fi
else
  ok "swap sudah ada"
fi

# ---------------------------------------------------------------------------------------------
step "2/6 Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl openssl >/dev/null
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || { echo "Docker Compose tidak tersedia."; exit 1; }
ok "$(docker --version)"

# ---------------------------------------------------------------------------------------------
step "3/6 Firewall (SSH, HTTP 80, HTTPS 443)"
if command -v ufw >/dev/null 2>&1; then
  ssh_ports() {
    { sshd -T 2>/dev/null || true; } | awk '/^port /{print $2}'
    echo "${SSH_CONNECTION:-}" | awk 'NF>=4{print $4}'
  }
  SSH_PORTS="$(ssh_ports | sort -u | xargs)" || SSH_PORTS=""
  for p in ${SSH_PORTS:-22}; do ufw allow "$p/tcp" >/dev/null; done
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  ok "ufw aktif - port terbuka: ${SSH_PORTS:-22} (SSH), 80, 443"
else
  warn "ufw tidak terpasang - lewati"
fi

# ---------------------------------------------------------------------------------------------
step "4/6 Konfigurasi (.env.prod)"
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ ! -f .env.prod ]; then
  echo "    Jawab beberapa pertanyaan (tekan Enter untuk memakai pilihan bawaan)."
  read -rp "    Domain aplikasi, mis. hbac.webelong.id (kosongkan = pakai IP $SERVER_IP dulu): " DOMAIN || true
  DOMAIN="$(printf '%s' "${DOMAIN:-}" | tr -d '[:space:]' | sed -E 's#^https?://##; s#/.*$##')"
  read -rsp "    GEMINI_API_KEY untuk Asisten AI (tempel lalu Enter; kosongkan = mode lokal): " GEMINI_KEY || true
  echo
  read -rp "    Aktifkan mode demo (tombol login satu klik ke akun contoh berdata fiktif)? [Y/n]: " ANS || true
  if [[ "${ANS:-Y}" =~ ^[Yy] ]]; then DEMO=true; else DEMO=false; fi
  if [ -n "$DOMAIN" ]; then SITE="$DOMAIN"; URL="https://$DOMAIN"; SECURE=true
  else SITE=":80"; URL="http://$SERVER_IP"; SECURE=false; fi
  umask 077
  cat > .env.prod <<EOF
# Dibuat oleh deploy/install.sh pada $(date '+%Y-%m-%d %H:%M'). Berisi rahasia - jangan dibagikan.
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
DEVICE_API_KEY=$(openssl rand -hex 16)
DEMO_PASSWORD=Demo-$(openssl rand -hex 6)
SITE_ADDRESS=$SITE
PUBLIC_URL=$URL
COOKIE_SECURE=$SECURE
DEMO_MODE=$DEMO
ALLOW_SELF_REGISTRATION=$DEMO
GEMINI_API_KEY=${GEMINI_KEY:-}
EOF
  umask 022
  ok ".env.prod dibuat (rahasia acak, hanya bisa dibaca root)"
else
  ok ".env.prod sudah ada - dipakai apa adanya"
fi

mkdir -p .caddy
if [ ! -f .caddy/basic_auth.caddy ] && [ ! -f .caddy/.no-auth ]; then
  if [ "$(envget DEMO_MODE)" = "true" ]; then bash deploy/site-password.sh --ask Y; else bash deploy/site-password.sh --ask N; fi
fi

# ---------------------------------------------------------------------------------------------
step "5/6 Build image & jalankan (pertama kali sekitar 10-15 menit di VPS 1 vCPU)"
if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -x db >/dev/null; then
  echo "    Aplikasi sudah berjalan - backup database dulu sebelum update..."
  bash deploy/backup.sh || warn "backup gagal - update tetap dilanjutkan"
fi
# Build satu per satu supaya RAM 2 GB tidak habis.
"${COMPOSE[@]}" build backend
"${COMPOSE[@]}" build frontend
"${COMPOSE[@]}" up -d --remove-orphans

printf '    Menunggu backend siap'
STATUS=starting
for _ in $(seq 1 60); do
  CID="$("${COMPOSE[@]}" ps -q backend 2>/dev/null || true)"
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' "$CID" 2>/dev/null || echo starting)"
  [ "$STATUS" = "healthy" ] && break
  printf '.'
  sleep 5
done
echo
if [ "$STATUS" = "healthy" ]; then ok "backend siap"; else warn "backend belum siap - cek log: cd $APP_DIR && ${COMPOSE[*]} logs --tail=100 backend"; fi
docker image prune -f >/dev/null 2>&1 || true
"${COMPOSE[@]}" ps

# ---------------------------------------------------------------------------------------------
step "6/6 Backup otomatis harian (jam 02:00, disimpan 7 hari di /root/hbac-backups)"
echo "0 2 * * * root bash $APP_DIR/deploy/backup.sh >> /var/log/hbac-backup.log 2>&1" > /etc/cron.d/hbac-backup
chmod 644 /etc/cron.d/hbac-backup
ok "jadwal: /etc/cron.d/hbac-backup"

# ---------------------------------------------------------------------------------------------
printf '\n\033[1;32mSelesai.\033[0m Buka aplikasi: %s\n' "$(envget PUBLIC_URL)"
if [ -f .caddy/basic_auth.caddy ]; then
  echo "  - Situs dikunci password. Username: $(awk 'NR==2{print $1}' .caddy/basic_auth.caddy)"
fi
if [ "$(envget DEMO_MODE)" = "true" ]; then
  echo "  - Mode demo aktif: pilih akun contoh di halaman login (satu klik)."
fi
echo "  - Password akun contoh (admin, budi, siti, ...): $(envget DEMO_PASSWORD) (tersimpan di $APP_DIR/.env.prod)"
echo
echo "  Perintah berguna:"
echo "    Lihat log       : cd $APP_DIR && ${COMPOSE[*]} logs -f --tail=100"
echo "    Pakai domain    : bash $APP_DIR/deploy/set-domain.sh hbac.domainanda.id"
echo "    Password situs  : bash $APP_DIR/deploy/site-password.sh   (atau --off untuk menghapus)"
echo "    Update aplikasi : tar -xzf /root/hbac-deploy.tar.gz -C $APP_DIR && bash $APP_DIR/deploy/install.sh"
