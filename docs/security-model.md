# AeroKin Security Model & Threat Architecture

## 1. Scope & System Architecture

AeroKin is designed strictly for **single-operator, same-LAN** operation.

* **Same-LAN Only**: Zero internet access, cloud relays, STUN/TURN traversal, serverless functions, or telemetry/analytics.
* **Local-TLS Only**: All traffic (HTTPS and WebSocket) is encrypted end-to-end over TLS using a 365-day leaf certificate signed by the AEROKIN Local Root CA.
* **Local-CA Trust Model**: The AEROKIN Local CA is generated locally on the host PC (`.certs/ca.crt`) and trusted explicitly on the controller device (via iOS Configuration Profile or Windows certificate store).
* **Supported Agent Host**: Windows PC only. Tested client: iPhone Safari / installed PWA. Android is UNTESTED.

---

## 2. Threat Model: Past Vulnerabilities vs. Present Mitigations

| Threat Vector | Previous State (Legacy Token) | Current Security Mitigation |
| :--- | :--- | :--- |
| **LAN Sniffing & URL Leakage** | 6-hex token passed in URL query string (`wss://host/?token=...`), exposed in web server logs, browser history, and proxy headers. | **No secrets in URLs.** WebSocket connections establish TLS first; authentication occurs in-band via the first message. |
| **Unauthenticated Input Injection** | If an attacker guessed the token or connected before auth, input frames could theoretically be buffered or processed. | **Strict drop-before-auth policy.** Input messages (`move`, `click`, `button`, `scroll`) are dropped until authentication completes. Unauthenticated connections are timed out after 5 seconds. |
| **Unauthorized Pairing on Wi-Fi** | A static 6-hex token was stored permanently on disk in `.certs/token.txt`. Any guest on the Wi-Fi who learned the token could connect indefinitely. | **Short-lived 8-digit pairing code (2 minutes, single-use) + Mandatory PC Operator Approval.** Even with a valid code, the PC operator must explicitly approve the connection (`y/N`) in the terminal. |
| **Credential Extraction from PC Disk** | Token stored in plain text on disk. | **Hash-only credential storage.** Server stores only SHA-256 hashes of the 32-byte cryptographic credentials in `.certs/devices.json`. Raw credentials never touch disk on the PC. |
| **Brute-Force Pairing Attacks** | Static token had no automatic lockout mechanism. | **Rate limiting & lockout.** Maximum 5 wrong codes per minute per IP and globally engages a 60-second exponential lockout. 5 total failures invalidate the active code immediately. |
| **Timing Attacks on Credentials** | Standard string comparisons could leak character equality timing. | `crypto.timingSafeEqual` is used on fixed-length SHA-256 digests. |
| **Resource Exhaustion / DoS** | Unlimited unauthenticated WebSocket connections could exhaust sockets or memory. | Per-IP concurrency limit (max 4 unauthenticated connections per IP) and tiny pre-auth maximum frame size (512 bytes). |
| **Stale / Compromised Devices** | No revocation mechanism existed. | **Per-device credentials & immediate live revocation.** Operators can rename, disconnect, or revoke any device from the PWA Settings drawer or PC terminal (`revoke <id>`, `revoke-all`). Revocation immediately terminates active WebSockets with code `4001`. |

---

## 3. Text Pairing Sequence Diagram

```text
Phone (PWA Client)                  PC Terminal / Server (Host)
        |                                       |
        |  1. GET / (or hosted PWA loaded)      |
        |-------------------------------------->|
        |                                       |
        |  [Terminal displays 8-digit code]     |
        |  [Valid for 2 min, regenerated]       |
        |                                       |
        |  2. POST /api/pair                    |
        |     { code, name, platform }          |
        |-------------------------------------->|
        |                                       |
        |                          3. Terminal Prompts Operator:
        |                             "Approve <name> (<platform>, IP)? (y/N)"
        |                             [30-second timeout, default deny]
        |                                       |
        |  4. HTTP 200 OK                       |
        |     { deviceId, rawCredential }       | (Only SHA-256 hash
        |<--------------------------------------|  stored in .certs/devices.json)
        |                                       |
        |  5. WSS TLS Handshake (port 8443)     |
        |<=====================================>|
        |                                       |
        |  6. First WS Message:                 |
        |     { type: 'auth', deviceId, cred }  | (Strict 5s timeout;
        |-------------------------------------->|  drop all input before auth)
        |                                       |
        |                                  7. Server hashes credential &
        |                                     compares via timingSafeEqual
        |                                       |
        |  8. WS Message: { type: 'auth_ok' }   |
        |<--------------------------------------|
        |                                       |
        |  === Authenticated Session Active === |
```

---

## 4. WebSocket Close Code Behavior

| Code | Reason | Server Condition | Client Reaction | Reconnect Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **`4001`** | `Unauthorized` | Invalid credentials, unauthenticated 5s timeout, or device revoked. | Clears stored device credential from localStorage. Transitions UI state to `unauthorized` (pairing required). | **No reconnect loop.** Halts reconnect attempts. |
| **`1008`** | `Policy Violation` | Disallowed `Origin` header, message > 512 bytes before auth, sustained message flood, or > 4 unauth connections from IP. | Displays policy violation banner with explanation. | **No reconnect loop.** Halts reconnect attempts to prevent flooding. |
| **`1000`** | `Normal Closure` | Intentional user logout or clean server shutdown. | Clears active socket reference; resets state cleanly. | **No reconnect.** User manually initiated disconnect. |
| **`1006`** | `Abnormal Closure` | Wi-Fi connection drop, laptop sleep, or network timeout. | Retains stored credentials; transitions UI state to `reconnecting`. | **Reconnect with exponential backoff** (1s to 8s maximum). |

---

## 5. Defense in Depth: Origin Header Verification

Cross-Origin Resource Sharing (CORS) preflights and WebSocket connection headers inspect the `Origin` header against an allow-list (`localhost`, local IP, `aerokin.local`, and custom entries from `AEROKIN_ALLOWED_ORIGINS`).

> [!NOTE]
> The `Origin` header check is defense-in-depth against malicious websites running in desktop browsers attempting Cross-Site WebSocket Hijacking (CSWSH). It is **not** an authentication mechanism, as native tools or attackers can forge arbitrary `Origin` headers. Authentication relies entirely on per-device cryptographic credentials.

---

## 6. What Is and Isn't Protected

### What Is Protected
* **Eavesdropping on LAN**: Encrypted with TLS (AES-GCM / ChaCha20-Poly1305).
* **Unauthorized pairing by guests**: 8-digit code + interactive PC terminal operator approval gate.
* **Credential leakage from PC disk**: Only SHA-256 hashes are persisted.
* **Credential theft via URLs**: Secrets are never transmitted in URLs or URL fragments.
* **Device access revocation**: Operators can disconnect any single device or all devices immediately.

### What Is NOT Protected
* **Physical access to PC**: If an attacker has local access to the Windows PC terminal, they can approve pairing or inspect running process memory.
* **Malicious approved devices**: Once a device is approved by the operator, it has control until the operator revokes it.
* **Host compromise**: Malware running with user or admin privileges on the PC can manipulate input directly.

---

## 7. UNVERIFIED Real-Device Items

The following aspects have not been formally verified on real hardware and must be documented as unverified:
1. **UNVERIFIED**: Android browser or Android PWA behavior (platform is completely untested and unsupported).
2. **UNVERIFIED**: Exact timeout duration before iOS 18 Safari terminates an inactive background WebSocket in an installed PWA while the screen is locked.
3. **UNVERIFIED**: Behavior of Safari Local Network prompt when switching between multiple LAN subnets or Wi-Fi APs without reloading the PWA.
