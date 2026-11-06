#!/usr/bin/env bash
# ==============================================================================
# AEROKIN Remote Infrastructure One-Click VPS Deploy Script
# For Ubuntu 22.04 / 24.04 LTS VPS
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "        AEROKIN Remote WebRTC & TURN Deployment           "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root: sudo bash deploy.sh"
  exit 1
fi

# 1. Install Docker & Docker Compose if missing
if ! command -v docker &> /dev/null; then
  echo "[+] Installing Docker..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# 2. Configure firewall (UFW)
if command -v ufw &> /dev/null; then
  echo "[+] Configuring firewall ports..."
  ufw allow 80/tcp comment 'HTTP (Caddy LetEncrypt)' || true
  ufw allow 443/tcp comment 'HTTPS (Signaling WSS)' || true
  ufw allow 3478/tcp comment 'Coturn STUN/TURN TCP' || true
  ufw allow 3478/udp comment 'Coturn STUN/TURN UDP' || true
  ufw allow 5349/tcp comment 'Coturn TURNS TLS' || true
  ufw allow 49152:49300/udp comment 'Coturn Relay UDP Range' || true
fi

# 3. Environment check
if [ ! -f .env ]; then
  echo "[!] .env not found. Generating default .env from .env.example..."
  cp .env.example .env
  PUBLIC_IP=$(curl -s https://api.ipify.org || echo "127.0.0.1")
  sed -i "s/EXTERNAL_IP=.*/EXTERNAL_IP=${PUBLIC_IP}/" .env
  RAND_SECRET=$(openssl rand -hex 24)
  sed -i "s/COTURN_SECRET=.*/COTURN_SECRET=${RAND_SECRET}/" .env
  echo "[+] Configured .env with Public IP: ${PUBLIC_IP}"
fi

# 4. Start Docker Compose
echo "[+] Starting AEROKIN Remote Services via Docker Compose..."
docker compose up -d --build

echo "=========================================================="
echo "  [✓] AEROKIN Signaling & Coturn are now running!        "
echo "  Health Check: http://localhost:8088/health              "
echo "=========================================================="
