# AeroKin Automated Test Matrix & Verification Coverage

This document outlines the test suites, verification tiers, execution commands, and environment coverage across the AeroKin repository.

---

## 1. Automated Test Suites Overview

| Package | Test Count | Test Focus | Command |
|---|---|---|---|
| **Hard Safety Shield** | Pre-commit | S1–S5 static grep guard: 0 forbidden power calls or test imports | `pnpm run safety:check` |
| **`aerokin-server`** | 247 tests | PowerActionExecutor, DeviceStore, InputBackend fakes, chunking reassembler, protocol drift, real-remote-auth loopback | `pnpm --filter aerokin-server test` |
| **`aerokin-pwa`** | 84 tests | Touch gestures, coordinate projection, multi-PC switching, modifier keys, hosting URL parser, diagnostics | `pnpm --filter aerokin-pwa test` |
| **`aerokin-signaling`** | 10 tests | Agent presence, HMAC-derived tokens, Origin allowlist, IP rate limiting, 5-fail lockout ban, Coturn REST auth | `pnpm --filter aerokin-signaling test` |
| **Total Automated** | **341 tests** | **100% Passing in CI and Local Environments** | `pnpm test` |

---

## 2. Test Dimension Matrix

### A. Subsystem & Functional Coverage

| Subsystem | Unit Tests | Integration Tests | Stress / Fuzz Tests | Security & Safety Tests |
|---|---|---|---|---|
| **Hardware & Power Safety** | Mocked executor | Countdown & cancel state machine | Rapid trigger race | Static grep guard (`safety:check`) |
| **Authentication & Pairing** | DeviceStore hashing | Loopback WebSocket & DataChannel | Rate limit burst (5/min) | 5-fail lockout, timingSafeEqual |
| **Signaling & Remote Presence** | Token derivation | Real-socket agent/phone handshake | Concurrency limits | Origin validation, fake token rejection |
| **WebRTC Transport** | DataChannel chunking | End-to-end ICE & DataChannel | 128KB packet fragmentation fuzz | Unauthenticated drop-before-auth |
| **Desktop Video Capture** | Sidecar parser | Monitor list & resolution check | Codec auto-fallback probe | NVENC hardware failure fallback |
| **Input & Trackpad** | Velocity math | Absolute coordinate scaling | Multi-touch gesture edge cases | Input pause filter switch |
| **Protocol Conformance** | Drift test (`protocol-drift.test.ts`) | Wire payload validation | Malformed JSON fuzzing | 512B pre-auth payload clamp |

---

## 3. Environment & Network Compatibility Matrix

| Operating System / Client | LAN Direct (WSS) | WebRTC P2P (STUN) | WebRTC Relay (TURN) | Status |
|---|---|---|---|---|
| **Windows 11 Host (Agent)** | Fully Supported | Fully Supported | Fully Supported | **Verified** |
| **Windows 10 Host (Agent)** | Fully Supported | Fully Supported | Fully Supported | **Verified** |
| **iOS 16–18 Mobile Safari (iPhone)** | Fully Supported | Verified in Loopback | Verified in Loopback | **Awaiting Cellular Field Test** |
| **iPadOS 16–18 Safari (iPad)** | Fully Supported | Verified in Loopback | Verified in Loopback | **Awaiting Cellular Field Test** |
| **Desktop Chrome / Edge / Firefox**| Fully Supported | Fully Supported | Fully Supported | **Verified** |
| **Android Chrome (PWA)** | Compatible | Compatible | Compatible | **Untested (Non-target)** |

---

## 4. Running the Complete Verification Suite

```bash
# 1. Run static safety check (Hardware power protection)
pnpm run safety:check

# 2. Run all workspace unit & integration tests
pnpm --filter aerokin-pwa test
pnpm --filter aerokin-signaling test
pnpm --filter aerokin-server test

# 3. Verify protocol drift
pnpm --filter aerokin-server test test/protocol-drift.test.ts

# 4. Compile entire workspace
pnpm run build
```
