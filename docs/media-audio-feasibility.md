# Windows Audio Features Feasibility Spike (Media 2.0)

This document provides a technical evaluation of three candidate audio features for AeroKin on Windows:
1. **Output Device Enumeration & Switching**
2. **Per-Application Volume Mixer**
3. **System or In-App Equalizer (EQ)**

Per AeroKin design rules, **no fake UI** is permitted in the client interface. Only capabilities backed by verified, reproducible Windows APIs are exposed.

---

## 1. Output Device Enumeration & Switching

### Windows API Path
* **Enumeration**:
  ```cpp
  IMMDeviceEnumerator* pEnum = NULL;
  CoCreateInstance(__uuidof(MMDeviceEnumerator), NULL, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&pEnum);
  IMMDeviceCollection* pDevices = NULL;
  pEnum->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &pDevices);
  ```
  Each active endpoint exposes `IPropertyStore`, yielding `PKEY_Device_FriendlyName` (e.g. *"Realtek High Definition Audio"*, *"AirPods Stereo"*).
* **Switching Default Device**:
  The official public Windows Core Audio API does **not** expose a method to set the default audio endpoint. Setting the default output requires using the undocumented COM interface `IPolicyConfig` (or `IPolicyConfigVista` / `IPolicyConfig10`):
  ```cpp
  // Undocumented Interface: IPolicyConfig
  // CLSID: {870C3566-1463-4A5F-B891-42DF460C7E9D}
  // IID:   {CA286FC0-DA22-4EE4-95E8-35532AB115F8}
  virtual HRESULT SetDefaultEndpoint(LPCWSTR wszDeviceId, ERole role);
  ```

### Permissions & System Requirements
* Standard user token (no Administrator privileges required).
* Fragile across Windows build releases: The vtable offset of `SetDefaultEndpoint` has shifted between Windows 7, Windows 10, and Windows 11 updates (22H2, 23H2, 24H2).

### Feasibility Verdict
* **Verdict**: **Feasible with Dedicated C# / COM Sidecar (Medium Complexity / Fragile)**
* **Implementation Decision**: **Omitted for Media 2.0**. Because `IPolicyConfig` is undocumented and prone to breaking across Windows cumulative updates, and because incomplete device switching produces broken audio states, no output device picker UI is built until an out-of-process C# service with vtable probing can be verified across supported Windows versions.

---

## 2. Per-Application Volume Mixer

### Windows API Path
* **WASAPI Audio Session Enumeration**:
  ```cpp
  IAudioSessionManager2* pSessionManager = NULL;
  pEndpoint->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, NULL, (void**)&pSessionManager);
  IAudioSessionEnumerator* pSessionEnum = NULL;
  pSessionManager->GetSessionEnumerator(&pSessionEnum);
  ```
* **Individual Session Control**:
  For each session:
  - Query `IAudioSessionControl2` to obtain `GetProcessId(&pid)`.
  - Query `ISimpleAudioVolume` to read or set volume:
    ```cpp
    ISimpleAudioVolume* pVolume = NULL;
    pSession->QueryInterface(__uuidof(ISimpleAudioVolume), (void**)&pVolume);
    pVolume->SetMasterVolume(fLevel, NULL); // 0.0f to 1.0f
    pVolume->GetMasterVolume(&fLevel);
    pVolume->SetMute(bMute, NULL);
    ```

### Permissions & System Requirements
* Standard user permissions.
* Real-time session monitoring requires implementing `IAudioSessionNotification` to detect when media applications launch, suspend, or terminate.
* Process association: UWP apps (e.g. Spotify from Microsoft Store, Netflix) often report `ApplicationFrameHost.exe` instead of their child process without inspecting `IAudioSessionControl2::GetSessionInstanceIdentifier`.

### Feasibility Verdict
* **Verdict**: **Feasible with Sidecar (Medium-High Complexity)**
* **Implementation Decision**: **Planned for Future Update**. The existing PowerShell sidecar currently manages system-wide Master Volume and SMTC transport. Adding per-application volume mixing requires bidirectional push notifications for session lifecycle events to avoid polling overhead. To avoid a half-working UI, per-app mixing is deferred to a dedicated C# native host.

---

## 3. System or In-App Equalizer (EQ)

### Windows API Path
* **System-Wide Audio Processing Objects (sAPO)**:
  In the Windows audio pipeline, audio effects (EQ, bass boost, room correction) must run inside the audio engine service (`audiosrv.exe`) as **Audio Processing Objects (APOs)**:
  - Requires implementing `IAudioProcessingObject` and `IAudioProcessingObjectRT`.
  - Must be registered under `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AudioEngine\AudioProcessingObjects`.
* **User-Space Limitations**:
  Standard Windows applications cannot intercept or manipulate another process's audio buffer in user mode without:
  1. Installing a virtual audio loopback driver (e.g. Virtual Audio Cable, VB-Audio Voicemeeter).
  2. Installing a third-party open-source APO driver such as **Equalizer APO**.

### Permissions & System Requirements
* Administrator privileges required to install and register APO DLLs.
* Microsoft WHQL driver signature or Windows Test Signing mode required for audio engine loading.
* Crash risk: A bug or unhandled exception in an APO crashes the Windows Audio service, muting all PC audio.

### Feasibility Verdict
* **Verdict**: **Blocked / High Complexity**
* **Implementation Decision**: **Rejected**. Building a custom system equalizer would require deploying signed kernel-mode or protected Windows Audio service drivers, directly violating AeroKin's lightweight, non-invasive design principles. No fake EQ sliders will ever be rendered in the AeroKin client.

---

## 4. Current Supported & Verified Implementation

AeroKin Media 2.0 strictly exposes features verified against official Windows interfaces:
1. **Master Volume Read & Write**: Verified real-time scalar volume control via `IAudioEndpointVolume` (0% to 100%).
2. **Master Mute Toggle**: Verified via `IAudioEndpointVolume::SetMute`.
3. **Universal Media Transport (SMTC)**: Verified via `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager` (Play, Pause, Skip, Timeline Scrubber with seekby/seekto).
4. **App Profile Fallback**: Verified keyboard emulation via Win32 `SendInput` (YouTube, Spotify, VLC, Netflix).
