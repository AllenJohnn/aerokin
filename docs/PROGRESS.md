# AEROKIN Project Progress & Session Resume Checklist

> **S9 Protocol**: This file is continuously updated after each commit and each completed milestone.
> If this machine or session restarts for any reason, read this file first, run `git status` and `git log -15 --oneline`, and continue from the EXACT next step listed below.

---

## Current Status & Next Action
- **Current Milestone**: Part 0.0 Complete; proceeding to commit Part 0.0 and tag `stable-p0-safety`.
- **Exact Next Step**: Commit `fix(server): block real power actions and input injection outside explicit opt-in`, push, tag `stable-p0-safety`.
- **Blocked Items**: None.
- **Safety Status**: S1-S6 active. Static guard `pnpm run safety:check` passing. Real power executor and real input backend strictly forbidden under test/CI and dry-run by default.

---

## Part 0.0: Safety Audit & Root Cause Analysis

### Investigation of Unexpected PC Shutdown / Restart Incident
In a previous run, Windows Event Log recorded:
- `"AEROKIN Remote Shutdown initiated from mobile client"`
- `"AEROKIN Remote Restart initiated from mobile client"`

**Root Cause Found**:
In `server/test/quick-actions.test.ts`, the Vitest suite tested the shutdown countdown state machine:
- Lines 120 and 148 called `actionService.executeAction('shutdown')` and `actionService.executeAction('restart')`.
- In `QuickActionService.ts`, these methods directly invoked `exec('shutdown.exe /s /t 10 ...')` and `exec('shutdown.exe /r /t 10 ...')`.
- At line 152, the test advanced fake timers by 11,000 ms (`vi.advanceTimersByTime(11000)`), triggering the countdown expiration callback, which called `executeFinalDangerousAction('restart')` -> `exec('shutdown.exe /r /t 0')`.
- Because the service was constructed without mocks in test, real Windows shutdown commands were sent to the operating system.

### Comprehensive Grep Audit of Power & Input Calls
The entire codebase was scanned for power transitions and input injection APIs:
1. **Power & Session Calls**:
   - `server/src/actions/QuickActionService.ts`:
     - `shutdown.exe /s /t 10` (line 180) -> Replaced by `PowerActionExecutor.execute('shutdown', { delaySeconds: 10 })`
     - `shutdown.exe /r /t 10` (line 182) -> Replaced by `PowerActionExecutor.execute('restart', { delaySeconds: 10 })`
     - `shutdown.exe /a` (line 242) -> Replaced by `PowerActionExecutor.cancelShutdown()`
     - `shutdown.exe /s /t 0` (line 259) -> Replaced by `PowerActionExecutor.execute('shutdown', { delaySeconds: 0 })`
     - `shutdown.exe /r /t 0` (line 261) -> Replaced by `PowerActionExecutor.execute('restart', { delaySeconds: 0 })`
     - `shutdown.exe /l` (line 263) -> Replaced by `PowerActionExecutor.execute('sign_out', { delaySeconds: 0 })`
     - `LockWorkStation` (line 57, 289) -> Replaced by `PowerActionExecutor.execute('lock')`
     - `rundll32.exe powrprof.dll,SetSuspendState` (line 299) -> Replaced by `PowerActionExecutor.execute('sleep')`
   - **Resolution**: All power and session calls now reside strictly in `server/src/actions/PowerActionExecutor.ts`. No other file in the repository contains any of these commands or APIs.
2. **Input Injection Calls**:
   - `server/src/native/win32.ts` (`SetCursorPos`, `mouse_event`, `SendInput`)
   - `server/src/input.ts`
   - `server/src/media/MediaCommandRouter.ts`
   - `server/src/actions/QuickActionService.ts`
   - **Resolution**: Routed through `InputBackend` (`RealInputBackend`, `NoOpInputBackend`, `RecordingInputBackend`). Under Vitest/CI or in tests, `RecordingInputBackend` or `NoOpInputBackend` is strictly used. Attempting to construct `RealInputBackend` under Vitest/CI throws immediately.

### Safety Safeguards Implemented
- `server/src/actions/PowerActionExecutor.ts`:
  - `RealPowerActionExecutor` throws if constructed under `NODE_ENV=test`, `VITEST`, `CI`, or without `process.env.AEROKIN_ALLOW_POWER_ACTIONS === '1'`.
  - `NoOpPowerActionExecutor` logs dry-run warnings and returns success.
  - `RecordingPowerActionExecutor` records all invocations for assertions.
- `server/src/input/InputBackend.ts`:
  - `RealInputBackend` throws if constructed under test/CI.
  - `RecordingInputBackend` records mouse moves, clicks, scrolls, keys, and text.
- `scripts/safety-check.mjs`:
  - Scans repository for any forbidden power calls outside `PowerActionExecutor.ts`.
  - Scans all test files for any direct imports of `RealPowerActionExecutor` or `RealInputBackend`.
  - Wired to `pnpm run safety:check`.
- `server/test/safety-guard.test.ts`:
  - Automated Vitest suite verifying the static invariants and runtime throw behavior.

---

## Parts Checklist

| Part | Title | Status | Notes / Blockers |
|------|-------|--------|------------------|
| **Part 0** | Emergency Safety Fix & Main Branch Sync | IN PROGRESS | Part 0.0 completed; ready for commit & tag `stable-p0-safety` |
| **Part 1** | Reported Bugs First + Cleanup (Inputs, GPU, VLC, Cleanup) | PENDING | To start after Part 0.3 |
| **Part 2** | Transport Abstraction + Desktop 2.0 Pipeline (LAN First) | PENDING | |
| **Part 3** | Signaling Service + Infrastructure as Code | PENDING | |
| **Part 4** | WebRTC Transport + Connection Manager | PENDING | |
| **Part 5** | Remote Pairing + Security | PENDING | |
| **Part 6** | All Existing Features over New Transport | PENDING | |
| **Part 7** | User Experience Refinement | PENDING | |
| **Part 8** | Design System + "Picture Perfect" UI Pass | PENDING | |
| **Part 9** | Windows CI, Installer, FFmpeg Provisioning | PENDING | |
| **Part 10** | Tray Icon + Pause Switch | PENDING | |
| **Part 11** | Saved PCs (Multi-PC Support) | PENDING | |
| **Part 12** | Feature Additions (Keyboard, Gestures, Tools, File Transfer) | PENDING | |
| **Part 13** | Engineering Quality + Performance | PENDING | |
| **Part 14** | Dashboard Polish & Remote Cards | PENDING | |
| **Part 15** | Rigorous Testing (Fuzz, Soak, E2E, Chaos) | PENDING | |
| **Part 16** | Documentation & Root README Rewrite | PENDING | |
| **Part 17** | Final UI Sweep & Verification | PENDING | |

---

## Decisions Taken Without Asking
1. **Safety Executor Architecture**: Grouped `shutdown`, `restart`, `sign_out`, `sleep`, `lock`, and `cancel_shutdown` into `PowerActionExecutor`.
2. **Safe Input Architecture**: Created `InputBackend` supporting cursor positioning, relative movement, clicks, dragging, scrolling, key presses, modifier combinations, and Unicode typing.
3. **Workspace Root Scripts**: Created a lightweight root `package.json` to allow `pnpm run safety:check` from root without impacting workspace structure.

---

## NEEDS ALLEN
*(Items that require Allen's external infrastructure, credentials, VPS, or physical device)*
1. **VPS for Remote Signaling & TURN**: Fresh Ubuntu VPS with public IP for hosting `signaling/` and `coturn`.
2. **Domain & DNS**: A-records pointing to VPS for automatic TLS termination via Caddy.
3. **Physical iPhone Cross-Network Test**: Testing WebRTC DataChannel connection over cellular LTE/5G away from home Wi-Fi.
4. **VLC / Audio Session Real Device Confirmation**: Verifying process media detection and volume mixer against real desktop media players.
5. **Real Power Actions Enablement**: For normal daily use, Allen must set `AEROKIN_ALLOW_POWER_ACTIONS=1` in his environment or launcher script if he wants real shutdown/reboot capabilities from his phone.
