# AeroKin Latency & Performance Protocol

> **Status**: UNVERIFIED until Allen conducts physical field testing on iPhone hardware.
> Do **not** invent or estimate synthetic numbers. Record real measurements from the live Diagnostics panel.

---

## 1. Latency Architecture & Optimizations

AeroKin is designed to minimize glass-to-glass input latency and video frame delivery delay across all supported network configurations (home Wi-Fi, office/public Wi-Fi, and iPhone Personal Hotspot).

### 1.1 Input Frame Coalescing
- **Pointer & Trackpad Input**: High-frequency touchmove and pointer events on the iPhone glass (firing up to 120Hz on ProMotion displays) are throttled and coalesced via `window.requestAnimationFrame`.
- **Zero Head-of-Line Blocking**: High-priority input messages (`move`, `click`, `key`) bypass telemetry queues. Pointer events send at most one coalesced delta packet per display refresh cycle, preventing WebSocket buffer bloating.
- **WebSocket Buffer Backpressure**: When client or server send buffer exceeds 256KB, the stream service drops video frames adaptively while keeping input packets in real time.

### 1.2 Video Capture & Codec Pipeline
- **Desktop Stream Default Preset**: Uses desktop-optimized H.264 hardware encoding where available (`h264` codec mode), falling back seamlessly to low-latency MJPEG/JPEG if H.264 negotiation fails.
- **Auto Codec Path**: Negotiates capability on initial stream handshake; H.264 streams utilize slice-based decoding with sub-frame presentation delay on modern Safari/iOS WebKit.

### 1.3 Built-in Input Round-Trip Meter
- **Ping / Pong Probing**: Continuous heartbeat probes measure true socket-level round-trip time (RTT).
- **Rolling Statistical Window**: Samples are collected into a 20-sample rolling ring buffer to compute:
  - **Min / Avg / Max**: Range overview.
  - **p50 (Median)**: Typical real-world response latency.
  - **p95**: Tail latency capturing worst-case Wi-Fi jitter or congestion spikes.
- **Live HUD Display**: Latency metrics are displayed in real-time in:
  1. **Settings Drawer > Diagnostics**: Tap the bottom sheet handle or gear icon to view p50, p95, min, avg, max, and time-to-connected.
  2. **Desktop HUD**: When viewing remote desktop, real-time latency and codec indicators are visible in the HUD overlay.

---

## 2. Measurement Guide for Allen

Follow these exact steps on your iPhone to measure and record real latency numbers.

### Test A: Home Wi-Fi (Same 5GHz / 2.4GHz Local Network)
1. Ensure both your PC and iPhone are connected to the same home Wi-Fi network.
2. Open AeroKin from your iPhone Home Screen icon (`https://<hostname>.local:8443`).
3. Verify the app connects automatically (subtle "Connecting..." badge clears in < 1s).
4. Drag your finger across the trackpad area for 10 seconds.
5. Tap **Settings** (gear icon) > **Diagnostics**.
6. Tap **Run Latency Test** (or observe the rolling RTT stats).
7. Record the observed values:
   - **p50 RTT**: `____ ms`
   - **p95 RTT**: `____ ms`
   - **Time to Connected**: `____ ms`
   - **Negotiated Video Codec**: `[ ] H.264 Auto  [ ] JPEG Fallback`

### Test B: iPhone Personal Hotspot (Laptop Tethered to Phone)
1. On iPhone, go to **Settings > Personal Hotspot** and turn on **Allow Others to Join**.
2. On your Windows laptop, connect Wi-Fi to your iPhone's Personal Hotspot network.
   *(Note: The iPhone assigns your laptop an IP in the `172.20.10.0/28` subnet, with the phone as gateway `172.20.10.1`).*
3. On your iPhone, open the AeroKin Home Screen icon.
4. Verify parallel probing discovers the laptop on `172.20.10.x` and connects automatically with no pairing screen.
5. Move the cursor and tap **Settings > Diagnostics**.
6. Record the observed values:
   - **p50 RTT**: `____ ms`
   - **p95 RTT**: `____ ms`
   - **Time to Connected**: `____ ms`

---

## 3. Reporting Results

When testing is complete, record the measured numbers directly into this section or log them in `docs/DEVICE-TEST-CHECKLIST.md`.

| Network Scenario | Host Target | p50 RTT (ms) | p95 RTT (ms) | Time-to-Connected (ms) | Verified By |
|------------------|-------------|--------------|--------------|------------------------|-------------|
| Home Wi-Fi (5GHz) | `<hostname>.local` | *[Pending]* | *[Pending]* | *[Pending]* | Allen |
| iPhone Personal Hotspot | `172.20.10.x` | *[Pending]* | *[Pending]* | *[Pending]* | Allen |
| Secondary Wi-Fi (Office/Guest) | LAN IP | *[Pending]* | *[Pending]* | *[Pending]* | Allen |
