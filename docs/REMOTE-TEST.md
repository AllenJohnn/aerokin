# AeroKin Cross-Network Remote Access Verification Guide

> **Verification Status**: **UNVERIFIED (Awaiting Allen's Cellular Test)**
> Cross-network cellular access via public WebRTC / Coturn relay is mathematically verified and tested on loopback sockets. It will be marked **VERIFIED** once Allen executes the test protocol below on physical iPhone hardware over 4G/5G mobile data.

---

## 1. Prerequisites for Testing

Before running the mobile test:
1. Ensure the Windows PC is running AeroKin (`pnpm --filter aerokin-server run start` or running as a Windows service).
2. Ensure the remote VPS is running the Signaling Server and Coturn Relay per [DEPLOY-VPS.md](file:///D:/Personal%20Project/aerokin/docs/DEPLOY-VPS.md).
3. The PC Dashboard displays **Signaling Connected** with green indicator.
4. Have your paired iPhone ready.

---

## 2. Step-by-Step Test Procedure

### Step 1: Disconnect iPhone from Home Wi-Fi
1. On your iPhone, swipe down to open **iOS Control Center**.
2. Tap the **Wi-Fi** icon to turn Wi-Fi **OFF**.
3. Verify that the status bar shows **5G**, **LTE**, or **4G** (cellular data only).

### Step 2: Open AeroKin PWA
1. Tap the **AeroKin** icon on your iPhone Home Screen (or navigate to `https://app.aerokin.com` in Safari).
2. If already paired, the app will automatically attempt connection over WebRTC.
3. If pairing for the first time over cellular:
   - On PC Dashboard, click **Pair New Device**.
   - Copy the secure remote pairing URL (`https://app.aerokin.com/#agent=<pcId>&signal=signal.<domain>&code=<8-digit>`) to your phone (via SMS, Notes, or QR scan).
   - Safari opens the PWA, immediately strips the fragment from the address bar, and submits the 8-digit code.
   - Accept the prompt on your PC.

### Step 3: Observe Connection Badge & Honest Telemetry
Look at the top connection status bar in the PWA:
- **DIRECT P2P (Green)**: STUN hole punching succeeded! Media and input flow directly between iPhone and PC without passing through any server. Expected RTT: 25–65ms (depending on cellular carrier routing).
- **TURN RELAY (Orange/Amber)**: Symmetric NAT traversal active. Media is relaying securely through your Coturn server. Expected RTT: 40–90ms.
- **NEVER shows "LAN"** while on cellular: AeroKin's transport strictly inspects the active WebRTC ICE candidate pair (`candidateType: "relay"` or `"srflx"`).

### Step 4: Verify Input & Control Operations
1. **Trackpad & Clicks**:
   - Move one finger across the black trackpad surface: PC mouse cursor moves smoothly.
   - Tap one finger: Left click on PC.
   - Two-finger tap: Right click on PC.
   - Two-finger drag: Smooth vertical scrolling.
2. **Keyboard Input**:
   - Tap keyboard icon, type characters: text enters active window on Windows PC.
3. **Desktop Video Stream**:
   - Tap **Desktop Viewer** tab.
   - Live Windows desktop stream appears in low-latency H.264/NVENC video feed.
   - Verify frame rate and responsiveness (under 100ms visual glass-to-glass latency).
4. **Media & System Controls**:
   - Switch to **Media** tab: test Play/Pause and Volume sliders.
   - Switch to **Quick Actions** tab: test Show Desktop (Win+D) or Lock PC.

### Step 5: Test Network Transition & Reconnect
1. While streaming the desktop over cellular, swipe down and turn **Wi-Fi ON** (connecting back to your home router).
2. Observe AeroKin:
   - WebRTC will initiate an ICE restart or transparently switch to the LAN WebSocket channel.
   - Connection indicator transitions to **LAN DIRECT (Green)** with sub-10ms latency.
3. Turn Wi-Fi **OFF** again:
   - Stream automatically recovers within 1–2 seconds back to WebRTC remote mode without requiring app reload.

---

## 3. Reporting Results

Record your findings in `docs/OVERNIGHT-REPORT.md` or message with:
1. **Carrier**: (e.g. Jio 5G, Airtel 4G, AT&T, T-Mobile, Vodafone).
2. **Connection Type**: `DIRECT P2P` or `TURN RELAY`.
3. **Glass-to-Glass Latency**: (perceived delay in trackpad movement).
4. **Desktop Streaming Quality**: Smoothness of video feed.
5. **Issues Encountered**: Any disconnects, packet drops, or UI glitches.
