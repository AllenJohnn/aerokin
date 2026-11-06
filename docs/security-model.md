# AeroKin Security Model & Threat Architecture

## 1. Scope & System Architecture

AeroKin is designed for **single-operator, dual-path** operation:
1. **Local Area Network (LAN Direct)**: Operates over direct TLS 1.3 WebSocket (`wss://<pc-ip>:4443`) using certificates signed by the host PC's self-generated local CA.
2. **Cross-Network Remote (WebRTC)**: Operates over direct P2P UDP or through a self-hosted Coturn STUN/TURN relay, with all media encrypted end-to-end via DTLS-SRTP and control data encrypted via DTLS DataChannels.

AeroKin has **zero dependency on commercial third-party remote software** (no AnyDesk, TeamViewer, Tailscale, or proprietary brokers).

---

## 2. Threat Model: Remote Signaling & Coturn Relay

When connecting across different networks (e.g. mobile cellular data to home PC), signaling coordinates session setup.

### A. What the Signaling Server Sees vs. Cannot See

```
┌────────────────────────────────────────────────────────┐
│                   Signaling Server                     │
│                                                        │
│  VISIBLE TO SIGNALING:                                 │
│  ✔ Room IDs (pcId)                                     │
│  ✔ sha256(agentSecret) hash (claims room)              │
│  ✔ sha256(signalingToken) hashes (paired client list)  │
│  ✔ Client & Host IP addresses (for rate limiting)      │
│  ✔ ICE candidate IP/port tuples                        │
│  ✔ Session negotiation timestamps                      │
│                                                        │
│  BLIND TO SIGNALING (ZERO ACCESS):                     │
│  ✖ Raw device credentials (never transmitted to VPS)   │
│  ✖ Keystrokes, mouse inputs, and text typed            │
│  ✖ Desktop video frames and screenshots                │
│  ✖ Audio streams                                       │
│  ✖ Clipboard contents and file transfers               │
│  ✖ PC power and system commands                        │
└────────────────────────────────────────────────────────┘
```

### B. What the Coturn TURN Relay Sees vs. Cannot See

- **Visible**: Source and destination IP/UDP port envelopes, bandwidth volume, and relay packet timing.
- **Blind**: All payload bytes inside the UDP packets are encrypted with DTLS-SRTP / DTLS using keys negotiated directly between the phone and PC. The TURN server cannot decrypt video, audio, or input.
- **SSRF Defense**: The Coturn server strictly blocks relaying to private and internal networks via `denied-peer-ip` rules (RFC 1918 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, Loopback `127.0.0.0/8`, Link-Local `169.254.0.0/16`, CGNAT `100.64.0.0/10`).

---

## 3. Threat Matrix & Defense Mechanisms

| Threat Vector | Attack Scenario | AeroKin Defense / Mitigation |
| :--- | :--- | :--- |
| **Guessing PC Signaling Room** | Attacker probes signaling server with random `pcId`s. | **256-bit Random `agentSecret`**: First registration claims room; subsequent registrations require constant-time comparison of `sha256(agentSecret)`. Generic error messages return identical `AUTH_FAILED`. |
| **Unauthorized WebRTC Join** | Unauthorized phone connects to signaling server. | **HMAC-Derived `signalingToken`**: Phone joins with `signalingToken = HMAC-SHA256(rawCredential, "aerokin-signaling-v1")`. Server validates against `sha256(signalingToken)` registered by host. Server locks out IP for 5 minutes after 5 consecutive failures. |
| **Compromised Signaling Server** | Attacker gains root on the signaling VPS. | **In-Band DataChannel Mutual Auth**: Signaling server cannot join or decrypt DataChannels. Even if an attacker injects a malicious peer, the host requires in-band authentication over the DTLS DataChannel using the raw credential. |
| **Credential Interception in URL** | Pairing link is saved or logged by intermediaries. | **Client-Side URL Fragments (`#`)**: Pairing code is passed as `https://app.aerokin.com/#agent=...&code=...`. The fragment is never transmitted to the HTTP web server, and the PWA immediately purges it via `window.history.replaceState`. |
| **LAN Eavesdropping** | Attacker sniffs local Wi-Fi traffic. | **Local CA TLS 1.3 Encryption**: All local HTTP and WebSocket traffic is protected by TLS with pinned certificates. |
| **Unauthenticated Input Injection** | Malicious client sends input before authentication. | **Strict Drop-Before-Auth**: Any input or control message received prior to successful authentication is discarded immediately. |
| **Brute-Force Pairing Codes** | Attacker tries all 100,000,000 8-digit codes. | **Rate Limiting & Lockout**: Maximum 5 attempts per minute per IP. 5 total failures invalidate the active code immediately. Operator approval (`y/N`) required on PC. |
| **Accidental Host Shutdown / Disruption (S1–S5)** | Malicious client or test invokes shutdown or restart. | **PowerActionExecutor Hard Guard**: Real executor is disabled by default (`AEROKIN_ALLOW_POWER_ACTIONS !== '1'`). Impossible to construct in test environments. Remote sessions have power actions disabled by default. |

---

## 4. In-Band Mutual Authentication Flow

```
Mobile Safari (PWA)                                Windows Host (Agent)
        │                                                    │
        │ <======= WebRTC DTLS Handshake Established ======> │
        │ (Direct P2P or Blind Coturn UDP Relay)             │
        │                                                    │
        │ 1. Open SCTP DataChannel ('control')               │
        │───────────────────────────────────────────────────>│
        │                                                    │
        │ 2. { type: 'auth', deviceId, credential: rawCred } │
        │───────────────────────────────────────────────────>│
        │                                                    │
        │                                    3. Verify rawCred
        │                                       against DeviceStore
        │                                       using timingSafeEqual
        │                                                    │
        │ 4. { type: 'auth_ok', deviceName, permissions }    │
        │<───────────────────────────────────────────────────│
        │                                                    │
        │ ======= Authenticated Remote Session Active ====== │
```

---

## 5. Security Invariants (Mandatory Code Rules)

1. **No Raw Secrets in Logs or URLs**: `agentSecret` and `rawCredential` are never printed to terminal, written to logs, or placed in URL query strings.
2. **Zero-Knowledge Signaling**: The signaling server only stores SHA-256 hashes of derived tokens and has zero access to raw credentials or user payload.
3. **Hardware & Power Safety**: All destructive power actions (`shutdown`, `restart`, `sleep`, `lock`) route strictly through `PowerActionExecutor`.
