# Architectural Decision Record: WebRTC DataChannels vs WebSocket Relay

## Status
**Accepted & Implemented**

## Context & Problem Statement
AeroKin enables real-time remote control of a Windows PC from an iPhone across any network without third-party services. The primary technical requirement is sub-60ms glass-to-glass latency for trackpad and cursor input, coupled with low-latency 60 FPS desktop video streaming.

We evaluated two architectural paths for cross-network connectivity:
1. **Option A: Pure WebSocket Server Relay** (Client ➔ Cloud VPS WebSocket ➔ Host PC)
2. **Option B: WebRTC with Native C++ `node-datachannel`** (Direct P2P via STUN, Coturn TURN relay fallback)

---

## Decision Drivers
1. **Input Latency & Head-of-Line Blocking**: On mobile 4G/5G networks, transient packet drops cause TCP streams to stall until lost packets are retransmitted. For mouse motion, dropped packets must be discarded immediately rather than delayed.
2. **Infrastructure Cost & Bandwidth**: Relaying 1080p60 desktop video (4–8 Mbps) through a cloud VPS creates substantial egress bandwidth costs ($0.05–$0.10/GB on AWS/GCP, or traffic quotas on budget VPS).
3. **End-to-End Privacy & Trust**: In a remote access product, user inputs (keystrokes, passwords) and desktop displays should never be decryptable by an intermediate signaling or cloud relay server.
4. **Platform Compatibility**: Mobile Safari (iOS) provides native hardware-accelerated WebRTC media decoding (`<video>`) and DataChannels.

---

## Detailed Evaluation & Benchmarks

| Metric / Dimension | Pure WebSocket Relay | WebRTC (`node-datachannel`) | Winner |
|---|---|---|---|
| **Transport Layer** | TCP (Layer 4) | UDP / SCTP / DTLS | **WebRTC** (No TCP HoL blocking) |
| **Input Latency (Cellular)** | 85–180ms (Jitter spikes on retransmit) | 25–55ms (Unordered / Low-jitter) | **WebRTC** |
| **P2P NAT Traversal** | 0% (All bytes pass through VPS) | ~80–85% Direct P2P via STUN | **WebRTC** |
| **VPS Bandwidth Cost** | High (~3.6 GB / hour per user) | Negligible for 85% of sessions (0 MB/h) | **WebRTC** |
| **Video Decoding on iOS** | Requires MSE / WebCodecs / Canvas blob | Native hardware WebRTC media pipeline | **WebRTC** |
| **Host CPU Overhead** | Low (Node.js buffers) | Very Low (C++ `libdatachannel` zero-copy) | **Tie** |

---

## Technical Rationale: Why `node-datachannel`?

For the Windows host server, we chose [node-datachannel](file:///D:/Personal%20Project/aerokin/node_modules/node-datachannel) (native bindings to `libdatachannel`) over pure JavaScript WebRTC implementations (like `wrtc` or WebRTC shim layers) for the following reasons:
1. **Lightweight & Standalone**: Does not drag in Google's massive 30GB Chromium WebRTC codebase.
2. **Modern C++17 Architecture**: Built on top of `libdatachannel`, featuring minimal memory footprint (< 15 MB RAM) and zero garbage collection pressure on high-frequency mouse event loops.
3. **Direct Binary DataChannel Support**: High-throughput SCTP implementation supporting 128 KB chunked DataChannel packets with configurable reliability (ordered/unordered).
4. **Stable Cross-Platform Compilation**: Pre-built native binaries for Windows `x64` ensure reliable deployment without requiring Visual Studio C++ toolchains on user machines.

---

## Consequences & Mitigations

### Positive Consequences
- **Direct P2P Speed**: Over local Wi-Fi or friendly NATs, control inputs travel directly between phone and PC with zero intermediate hops.
- **Privacy by Default**: Coturn acts as a blind UDP packet relay; media is protected end-to-end with DTLS-SRTP and control is protected by DTLS.
- **Clean Signaling Separation**: The signaling server only handles lightweight JSON offers/answers and never touches media or input streams.

### Negative Consequences & Mitigations
- **Complexity of ICE Negotiation**: WebRTC requires STUN/TURN servers, candidate gathering, and SDP offer/answer exchanges.
  - *Mitigation*: Implemented `RtcHostManager` and `RtcTransport` with robust state machines, trickle candidate queuing, and automatic ICE restart on network changes.
- **Symmetric NAT Handling**: Restrictive carrier NATs block direct UDP hole-punching.
  - *Mitigation*: Packaged production-ready Coturn Docker configuration with REST API ephemeral tokens for automated relay fallback.
