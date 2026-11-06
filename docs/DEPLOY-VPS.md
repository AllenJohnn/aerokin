# Production VPS Deployment Guide: AEROKIN Remote Infrastructure

This guide details the complete deployment of the self-hosted **AEROKIN WebRTC Signaling Server** and **Coturn STUN/TURN Relay** on a fresh **Ubuntu 24.04 LTS VPS** (Hetzner, DigitalOcean, OVH, Linode, AWS Lightsail).

---

## 1. Prerequisites & Sizing

### A. Recommended VPS Specifications
- **Operating System**: Ubuntu 24.04 LTS (64-bit)
- **Instance Size**: 1 vCPU, 1 GB to 2 GB RAM, 20 GB NVMe / SSD
- **Network**: Static Public IPv4 address (and optional IPv6)
- **Recommended Providers**:
  - **Hetzner Cloud**: CX22 (~€3.50/mo, 20 TB traffic included) - **Recommended**
  - **DigitalOcean**: Basic Droplet ($4–$6/mo, 1 TB transfer)
  - **OVHcloud**: VPS Starter (~$4.20/mo, unmetered bandwidth)

### B. DNS Records
Configure two `A` records at your DNS registrar pointing to your VPS public IPv4 (e.g. `198.51.100.25`):
1. `signal.yourdomain.com` ➔ `198.51.100.25` (For Caddy HTTPS reverse proxy & WebSocket signaling)
2. `turn.yourdomain.com` ➔ `198.51.100.25` (For Coturn STUN/TURN UDP/TCP relay)

*(Optional: If your VPS has public IPv6, add corresponding `AAAA` records).*

---

## 2. Server Preparation & UFW Firewall

Connect via SSH to your clean Ubuntu 24.04 VPS:

```bash
ssh root@198.51.100.25
```

### A. System Updates & Essential Packages
```bash
apt-get update && apt-get upgrade -y
apt-get install -y curl git ufw fail2ban ca-certificates apt-transport-https gettext-base
```

### B. Docker Engine & Compose Plugin Installation
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

### C. Configure Strict UFW Firewall
AeroKin requires standard web ports (80, 443), STUN/TURN ports (3478, 5349), and dynamic WebRTC media relay UDP ports (49152-65535):

```bash
# Default policies
ufw default deny incoming
ufw default allow outgoing

# Management & Web
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'Caddy ACME HTTP'
ufw allow 443/tcp comment 'Caddy HTTPS / WSS'

# Coturn STUN/TURN
ufw allow 3478/tcp comment 'Coturn STUN/TURN TCP'
ufw allow 3478/udp comment 'Coturn STUN/TURN UDP'
ufw allow 5349/tcp comment 'Coturn TURNS TLS'

# WebRTC Dynamic UDP Relay Range
ufw allow 49152:65535/udp comment 'Coturn WebRTC Relay UDP'

# Enable firewall
ufw --force enable
ufw status verbose
```

---

## 3. Clone Repository & Setup Configuration

### A. Clone AeroKin
```bash
mkdir -p /opt/aerokin
cd /opt/aerokin
git clone https://github.com/AllenJohnn/aerokin.git .
cd signaling
```

### B. Generate Cryptographic Secrets
Use the bundled secret generator script to generate high-entropy tokens:

```bash
chmod +x ../scripts/generate-secrets.sh
../scripts/generate-secrets.sh
```

This generates:
- `TURN_SECRET`: 64-character hex string (256-bit entropy) for Coturn REST API authentication.

### C. Configure Environment Variables
Copy the deployment template:

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Populate the fields:
```env
EXTERNAL_IP=198.51.100.25
COTURN_HOST=turn.yourdomain.com
COTURN_REALM=yourdomain.com
COTURN_SECRET=your_generated_turn_secret_here
ALLOWED_ORIGINS=https://app.aerokin.com,https://yourdomain.com
COTURN_MIN_PORT=49152
COTURN_MAX_PORT=65535
NODE_ENV=production
PORT=3000
```

### D. Render Coturn Configuration Template
Generate the final `turnserver.conf` from `turnserver.conf.template`:

```bash
export $(grep -v '^#' deploy/.env | xargs)
envsubst < turnserver.conf.template > turnserver.conf
```

Verify that `turnserver.conf` contains your actual `EXTERNAL_IP`, `COTURN_REALM`, `COTURN_SECRET`, and port ranges without any unexpanded `$VARIABLES`.

---

## 4. Reverse Proxy & Automated SSL (Caddy)

Caddy automatically provisions Let's Encrypt / ZeroSSL certificates and handles WebSocket upgrades transparently.

Create `/opt/aerokin/signaling/Caddyfile`:

```caddy
signal.yourdomain.com {
    encode gzip zstd

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Reverse proxy to signaling container
    reverse_proxy signaling:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

---

## 5. Launch Services via Docker Compose

Inspect `docker-compose.yml` and launch all services in detached mode:

```bash
docker compose up -d --build
```

### Verification Commands
1. Check container health:
   ```bash
   docker compose ps
   ```
2. Verify HTTP health check:
   ```bash
   curl -i https://signal.yourdomain.com/health
   # Expected: HTTP/2 200 OK {"status":"ok","rooms":0,...}
   ```
3. Test TURN credential generation:
   ```bash
   curl -i https://signal.yourdomain.com/turn-credentials
   # Expected: HTTP/2 401 Unauthorized (Auth token required)
   ```
4. Verify STUN connectivity using `turnutils_uclient` (or online WebRTC ICE test):
   ```bash
   docker compose exec coturn turnutils_uclient -s -u test -w test 127.0.0.1
   ```

---

## 6. Linking Host PC to Signaling VPS

On Allen's Windows PC:
1. Open AeroKin Desktop Dashboard (`https://localhost:4443`).
2. Navigate to **Settings** ➔ **Remote Signaling**.
3. Set **Signaling URL**: `wss://signal.yourdomain.com`.
4. The PC agent will automatically register with its random 256-bit `agentSecret`.
5. Generate a pairing link via **Pair New Device**:
   The link will format as:
   `https://app.aerokin.com/#agent=<pcId>&signal=signal.yourdomain.com&code=<8-digit>`

---

## 7. Bandwidth Warning & Resource Planning

### A. Data Consumption Expectations
- **Direct P2P (STUN)**: 0 bytes of media pass through your VPS. Media flows directly between iPhone and PC.
- **Relayed (TURN)**: When either peer is on a symmetric NAT cellular connection, encrypted media relays through Coturn.
  - Desktop stream at **1080p 60fps** (H.264 High Profile): ~4 to 8 Mbps.
  - **Hourly usage**: ~1.8 GB to 3.6 GB per hour of active remote desktop streaming.
  - **Monthly budget**: A Hetzner CX22 with 20 TB monthly traffic comfortably supports >5,000 hours of relay streaming per month.

### B. Private IP Denial Defense
The rendered Coturn template contains explicit `denied-peer-ip` directives for:
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918)
- `127.0.0.0/8` (Loopback)
- `169.254.0.0/16` (Cloud Metadata & Link-Local)
- `100.64.0.0/10` (Carrier Grade NAT)
This prevents malicious WebRTC clients from using your TURN server as an SSRF proxy to scan private infrastructure.

---

## 8. Maintenance, Logs & Rollback

### A. Live Log Inspection
```bash
# Follow signaling logs
docker compose logs -f --tail=100 signaling

# Follow coturn logs
docker compose logs -f --tail=100 coturn
```

### B. Upgrading AeroKin Signaling
```bash
cd /opt/aerokin/signaling
git pull origin main
docker compose up -d --build
```

### C. Clean Rollback / Restart
```bash
# Restart all services
docker compose restart

# Full stop and clean restart
docker compose down
docker compose up -d
```
