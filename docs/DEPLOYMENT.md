# AEROKIN Remote Infrastructure & VPS Deployment Guide

This guide covers deploying the self-hosted **AEROKIN WebRTC Signaling Service** and **Coturn STUN/TURN Relay** on your own VPS (e.g. Hetzner, DigitalOcean, Linode, AWS Lightsail, Oracle Cloud).

---

## 1. Prerequisites & DNS Setup

### A. Minimal VPS Requirements
- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **Specs**: 1 vCPU, 1 GB RAM, 10 GB Disk (typically $3-$5/mo)
- **Network**: Static Public IPv4 address

### B. DNS Records
Create two `A` records pointing to your VPS public IPv4 (e.g. `203.0.113.10`):
1. `signaling.yourdomain.com` -> `203.0.113.10` (for Caddy reverse proxy & WebSockets)
2. `turn.yourdomain.com` -> `203.0.113.10` (for Coturn STUN/TURN relay)

---

## 2. Firewall Ports

The deployment uses the following ports:

| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| `80` | TCP | Caddy | HTTP (ACME Let's Encrypt validation) |
| `443` | TCP | Caddy | HTTPS / WSS (Secure WebSocket Signaling) |
| `3478` | UDP & TCP | Coturn | Standard STUN/TURN binding |
| `5349` | TCP | Coturn | TURNS (TLS-wrapped TURN) |
| `49152-49300` | UDP | Coturn | Dynamic peer media relay port range |

---

## 3. Fast One-Command Deployment

On your fresh Ubuntu VPS:

```bash
# 1. Clone repository
git clone https://github.com/AllenJohnn/aerokin.git
cd aerokin/signaling

# 2. Configure .env
cp .env.example .env
nano .env

# Set:
# EXTERNAL_IP=<Your VPS IP>
# AEROKIN_SIGNALING_DOMAIN=signaling.yourdomain.com
# COTURN_HOST=turn.yourdomain.com
# COTURN_SECRET=<Generate with: openssl rand -hex 32>
# COTURN_REALM=yourdomain.com

# 3. Run deploy script
sudo bash deploy.sh
```

---

## 4. Architecture & Security Invariants

1. **Zero Video Relaying through Node.js**:
   The signaling server *only* relays small JSON messages (SDP offer/answer and ICE candidate strings). Video frames and audio streams are sent directly peer-to-peer (P2P).
2. **Direct P2P Preference**:
   Over 80% of cross-network WebRTC connections connect directly via STUN hole-punching without relaying.
3. **TURN Only When Necessary**:
   If both devices are behind symmetric NATs or restrictive cellular firewalls, traffic relays through the self-hosted Coturn daemon using ephemeral HMAC-SHA1 tokens.
4. **Zero Third-Party Relays or SaaS**:
   No reliance on AnyDesk, TeamViewer, Twilio, or external WebRTC brokers. You own 100% of your data and connections.
