# AeroKin Communication Protocol Specification (v1.0)

This document specifies the wire protocol, message structures, framing rules, and rate limits for communication between the **AeroKin Client (PWA)**, **AeroKin Server (Windows Host)**, and **Signaling Relay**.

---

## 1. Transport & Framing

AeroKin communicates over two primary channels:
1. **Local Area Network (LAN)**: WebSocket over TLS 1.3 on port `4443` (binary/text frames, max authenticated frame size `131072` bytes / 128 KB).
2. **WebRTC Remote**: SCTP DataChannels (`control`, `input`, `metrics`, `media`).

### DataChannel Chunking Protocol (12-byte Binary Framing)
When messages exceed the WebRTC SCTP maximum message size (64 KB), they are fragmented and packetized with a 12-byte big-endian binary header:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Message ID (uint32)                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Chunk Index (uint32)                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Total Chunks (uint32)                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Payload Bytes...                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

---

## 2. WebRTC Signaling Protocol

Used exclusively to negotiate WebRTC sessions between host and phone.

| Type | Direction | Fields | Description |
|------|-----------|--------|-------------|
| `register` | Host ➔ Server | `{ pcId, agentSecret }` | Host claims room ID using 256-bit secret |
| `registered` | Server ➔ Host | `{ pcId, iceServers }` | Confirmation with STUN/TURN configurations |
| `add_client_token` | Host ➔ Server | `{ clientTokenHash }` | Registers `sha256(signalingToken)` for paired device |
| `remove_client_token` | Host ➔ Server | `{ clientTokenHash }` | De-registers revoked device token |
| `join` | Phone ➔ Server | `{ pcId, signalingToken }` | Phone joins room using token derived from raw credential |
| `joined` | Server ➔ Phone | `{ pcId, iceServers }` | Confirmation with STUN/TURN configurations |
| `offer` | Phone ➔ Server ➔ Host | `{ targetPeerId, sdp }` | WebRTC SDP offer |
| `answer` | Host ➔ Server ➔ Phone | `{ targetPeerId, sdp }` | WebRTC SDP answer |
| `candidate` | Bidirectional | `{ targetPeerId, candidate, sdpMid, sdpMLineIndex }` | Trickle ICE candidate |
| `error` | Server ➔ Client | `{ code, message }` | Generic error (e.g. `AUTH_FAILED`, `PC_OFFLINE`) |

---

## 3. Client-to-Host Messages (`ValidClientMessage`)

### A. Authentication & Lifecycle
- `auth`: `{ type: "auth", deviceId: string, credential: string }`
- `logout`: `{ type: "logout" }`
- `ping`: `{ type: "ping", t: number }`
- `battery`: `{ type: "battery", percent: number | null, charging?: boolean }`
- `tail_logs`: `{ type: "tail_logs", limit?: number }`

### B. Device Management
- `device_list`: `{ type: "device_list" }`
- `device_rename`: `{ type: "device_rename", deviceId: string, name: string }`
- `device_revoke`: `{ type: "device_revoke", deviceId: string }`
- `device_revoke_all`: `{ type: "device_revoke_all", exceptCurrent?: boolean }`

### C. Trackpad, Mouse & Relative Input
- `move`: `{ type: "move", dx: number, dy: number }` (Clamped to `[-200, 200]`)
- `click`: `{ type: "click", button: "left" | "right" | "middle" }`
- `button`: `{ type: "button", button: "left" | "right" | "middle", state: "down" | "up" }`
- `scroll`: `{ type: "scroll", dy: number, dx: number }` (Clamped to `[-500, 500]`)

### D. Absolute Coordinate Input (Desktop Viewer)
- `abs_move`: `{ type: "abs_move", x: number, y: number, monitorId?: string }`
- `abs_click`: `{ type: "abs_click", button: "left" | "right" | "middle", count?: number, x?: number, y?: number, monitorId?: string }`
- `abs_button`: `{ type: "abs_button", button: "left" | "right" | "middle", state: "down" | "up", x?: number, y?: number, monitorId?: string }`

### E. Keyboard & Text Entry
- `key`: `{ type: "key", key: string, action?: "down" | "up" | "tap", modifiers?: string[] }`
- `text`: `{ type: "text", text: string }` (Max 1000 characters)

### F. Media & Volume Control
- `media`: `{ type: "media", action: AllowedMediaAction, sessionId?: string }`
- `seekby`: `{ type: "seekby", seconds: number, sessionId?: string }`
- `seekto`: `{ type: "seekto", position: number, sessionId?: string }`
- `session`: `{ type: "session", id: string }`
- `setvolume`: `{ type: "setvolume", level: number }` (Clamped `[0, 100]`)
- `getvolume`: `{ type: "getvolume" }`

**Allowed Media Actions**:
`playpause`, `next`, `prev`, `stop`, `volup`, `voldown`, `mute`, `fullscreen`, `seekfwd`, `seekback`

### G. Quick Actions & App Launcher
- `quick_action`: `{ type: "quick_action", action: AllowedQuickAction, payload?: string }`
- `launcher_list`: `{ type: "launcher_list" }`
- `features_get`: `{ type: "features_get" }`

**Allowed Quick Actions**:
`lock_pc`, `sleep`, `monitor_off`, `show_desktop`, `task_view`, `task_manager`, `volume_mute`, `brightness_up`, `brightness_down`, `send_link`, `type_text`, `shutdown`, `restart`, `sign_out`, `cancel_shutdown`, `launch_app`

### H. Desktop Streaming & Screenshots
- `desktop_start`: `{ type: "desktop_start", monitorId?: string, preset?: "low" | "balanced" | "high" | "ultra", customScale?: number, customFps?: number, codec?: "h264" | "mjpeg", viewOnly?: boolean }`
- `desktop_stop`: `{ type: "desktop_stop" }`
- `desktop_monitors`: `{ type: "desktop_monitors" }`
- `set_view_only`: `{ type: "set_view_only", viewOnly: boolean }`
- `screenshot_request`: `{ type: "screenshot_request", target?: "all" | "active_window" | "monitor", monitorId?: string, includeCursor?: boolean }`

### I. Clipboard & System Stats
- `clipboard_get`: `{ type: "clipboard_get" }`
- `clipboard_set`: `{ type: "clipboard_set", text: string }`
- `clipboard_set_and_paste`: `{ type: "clipboard_set_and_paste", text: string }`
- `clipboard_clear_history`: `{ type: "clipboard_clear_history" }`
- `stats_subscribe`: `{ type: "stats_subscribe", intervalMs?: number }`
- `stats_unsubscribe`: `{ type: "stats_unsubscribe" }`

---

## 4. Server-to-Client Messages

- `auth_ok`: `{ type: "auth_ok", deviceId, deviceName, permissions, requiresApproval? }`
- `auth_failed`: `{ type: "auth_failed", reason: string }`
- `status`: `{ type: "status", status: "online" | "paused" | "busy", hostName: string }`
- `device_list`: `{ type: "device_list", devices: DeviceRecord[] }`
- `features`: `{ type: "features", flags: Record<string, boolean> }`
- `quick_action_result`: `{ type: "quick_action_result", action, success: boolean, message?: string }`
- `action_pending`: `{ type: "action_pending", action: string, remainingSeconds: number }`
- `action_cancelled`: `{ type: "action_cancelled", action: string }`
- `clipboard_content`: `{ type: "clipboard_content", text: string }`
- `stats`: `{ type: "stats", cpu, memory, network, timestamp }`
- `error`: `{ type: "error", error: string, code?: number }`
- `pong`: `{ type: "pong", t: number }`

---

## 5. Security & Rate Limits

1. **Unauthenticated Connections**:
   - Max 4 unauthenticated connections per IP.
   - 512-byte payload size limit before authentication.
   - 10-second timeout to complete authentication.
2. **Authenticated Rate Limits**:
   - `move` / `abs_move`: 120 messages/sec (token bucket).
   - `click` / `button`: 30 messages/sec.
   - `key` / `text`: 30 messages/sec.
   - `quick_action`: 5 messages/sec (dangerous actions guarded by 10s countdown).
   - `clipboard_set`: 5 messages/sec (max 100 KB payload).
   - Maximum WebSocket payload: 128 KB.
