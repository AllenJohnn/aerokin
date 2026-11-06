# AeroKin System Architecture & Transport Topology

AeroKin is a zero-third-party remote desktop and control platform providing seamless, low-latency control of a Windows PC from an iPhone or browser client. It maintains a dual-path architecture: ultra-low latency direct LAN mode when on the same network, and encrypted WebRTC (P2P STUN or Coturn TURN relay) when operating across cellular and WAN networks.

---

## 1. Multi-Path Transport Hierarchy

AeroKin prioritizes connections strictly by latency and overhead. LAN WebSocket is preferred whenever available; otherwise, WebRTC negotiates the most direct possible route.

```mermaid
flowchart TD
    Client["iPhone / Browser Client (PWA)"]
    
    subgraph "Local Area Network (LAN)"
        PC_LAN["AeroKin Windows Host (:4443)"]
    end
    
    subgraph "Public Internet / WAN"
        Signaling["AeroKin Signaling Server (:443 Caddy)"]
        Coturn["Coturn STUN/TURN Relay (:3478 / :49152-65535)"]
    end
    
    Client -- "1. LAN Probe (sub-10ms WSS)" --> PC_LAN
    Client -. "2. If LAN unreachable: Connect" .-> Signaling
    PC_LAN -. "Register Agent Secret" .-> Signaling
    
    Signaling -- "Exchange SDP & ICE" --> Client
    Signaling -- "Exchange SDP & ICE" --> PC_LAN
    
    Client == "Path A: Direct P2P (STUN Hole-Punch)" === PC_LAN
    Client -. "Path B: Symmetric NAT (TURN Relay)" .-> Coturn
    Coturn -. "Relayed Encrypted Media" .-> PC_LAN
```

### Transport Path Resolution

1. **Path 1: LAN Direct (WebSocket over TLS)**
   - Target: `wss://<pc-lan-ip>:4443`
   - Latency: < 5–10ms
   - Encryption: TLS 1.3 with pinned local CA certificate
   - Used when iPhone and PC share the same Wi-Fi subnet.
2. **Path 2: WebRTC Direct P2P (STUN Hole-Punching)**
   - Target: Direct UDP peer connection via STUN `srflx` candidates
   - Latency: 20–50ms
   - Encryption: DTLS-SRTP for media, DTLS DataChannels for control/input
   - Used when traversing standard NATs and cellular networks without symmetric port randomization.
3. **Path 3: WebRTC Coturn Relay (TURN)**
   - Target: Relayed via self-hosted Coturn daemon
   - Latency: 40–80ms
   - Encryption: End-to-end DTLS (Coturn forwards raw encrypted UDP packets; cannot inspect payload)
   - Used when both ends are behind restrictive enterprise or carrier-grade NATs.

---

## 2. Signaling Protocol & In-Band Authentication Sequence

AeroKin completely separates signaling presence from host authentication. The public signaling server *never* learns device credentials.

```mermaid
sequenceDiagram
    autonumber
    participant Host as Windows Host Agent
    participant Sig as Signaling Server (VPS)
    participant Phone as iPhone Safari PWA

    Note over Host,Sig: Host Boot & Registration
    Host->>Host: Read / generate agentSecret (256-bit random)
    Host->>Sig: register { pcId, agentSecret }
    Sig->>Sig: Hash & store sha256(agentSecret)
    Sig-->>Host: registered { pcId, iceServers }

    Note over Host,Phone: Device Pairing Token Sync
    Phone->>Phone: signalingToken = HMAC-SHA256(rawCred, "aerokin-signaling-v1")
    Host->>Sig: add_client_token { clientTokenHash: sha256(signalingToken) }
    Sig-->>Host: token_added

    Note over Phone,Sig: Cross-Network Discovery
    Phone->>Sig: join { pcId, signalingToken }
    Sig->>Sig: Verify sha256(signalingToken) in registered hashes
    Sig-->>Phone: joined { iceServers }

    Note over Host,Phone: WebRTC Offer / Answer & ICE
    Phone->>Sig: offer { targetPeerId: pcId, sdp }
    Sig->>Host: offer { sourcePeerId, sdp }
    Host->>Sig: answer { targetPeerId, sdp }
    Sig->>Phone: answer { sourcePeerId, sdp }
    Host-->>Phone: Trickle ICE Candidates (via Signaling)

    Note over Host,Phone: Direct WebRTC DataChannel Handshake
    Host->>Phone: WebRTC DataChannels Open (control, input, metrics, media)
    Phone->>Host: { type: "auth", deviceId, credential: rawCred } (Over control channel)
    Host->>Host: Verify rawCred against DeviceStore
    Host-->>Phone: { type: "auth_ok", deviceName, permissions }
```

---

## 3. Remote URL Fragment Pairing Flow

To prevent accidental disclosure of 8-digit pairing codes in web server access logs, AeroKin uses client-side URL fragments (`#`) rather than query parameters (`?`).

```mermaid
sequenceDiagram
    autonumber
    participant PC as PC Operator (Dashboard)
    participant Host as AeroKin Server
    participant Phone as Mobile Safari
    participant Hist as Browser History / Log

    PC->>Host: Click "Pair New Device"
    Host->>Host: Generate 8-digit ephemeral code
    Host-->>PC: URL: https://app.aerokin.com/#agent=pc_123&signal=signal.domain.com&code=12345678
    PC->>Phone: Scan QR / Open Link
    Phone->>Phone: Load https://app.aerokin.com/
    Note over Phone,Hist: HTTP GET sends ZERO fragment data to web server
    Phone->>Phone: JS reads window.location.hash
    Phone->>Hist: window.history.replaceState({}, '', '/')
    Note over Hist: Fragment PURGED immediately from history & DOM
    Phone->>Host: Submit pairing request with 8-digit code
    Host->>PC: Display prompt on PC screen
    PC->>Host: Operator approves device
    Host-->>Phone: Issue permanent raw credential
```

---

## 4. Windows Desktop Video Capture Pipeline

AeroKin captures the Windows desktop with hardware acceleration, minimizing CPU usage and battery drain.

```mermaid
flowchart LR
    DXGI["Desktop Duplication API (DXGI / ddagrab)"] --> NVENC["NVIDIA NVENC Hardware Encoder (h264_nvenc)"]
    NVENC --> PACK["RTP / WebRTC Packetizer"]
    PACK --> DC["WebRTC Media Stream (H.264 Baseline/High)"]
    DC --> IOS["iOS Safari Hardware Video Decoder (<video>)"]

    subgraph "Fallback Engine (Non-NVIDIA / Fallback)"
        CPU_CAP["GDI / BitBlt"] --> CPU_ENC["libx264 / MJPEG Low-Latency"]
        CPU_ENC -.-> PACK
    end
```

### Video Performance Targets
- **Resolution**: Native 1080p (1920x1080) or custom viewport scale.
- **Framerate**: 60 FPS (with automatic 30 FPS throttling on mobile battery saver).
- **Latency**: 30–65ms glass-to-glass latency over local Wi-Fi, < 100ms over cellular.
- **Codec Negotiation**: H.264 profile-level-id `42e01f` (constrained baseline) for universal iOS Safari hardware decoding.
