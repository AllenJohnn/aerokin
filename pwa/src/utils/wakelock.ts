/**
 * Manages the Screen Wake Lock API to prevent the iPhone display
 * from sleeping while connected to the PC.
 */

let wakeLock: WakeLockSentinel | null = null;
let isRequested = false;

export async function requestWakeLock(): Promise<void> {
  isRequested = true;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return;
  }

  try {
    if (!wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    }
  } catch {
    // Silently ignore if denied or battery saver active
  }
}

export function releaseWakeLock(): void {
  isRequested = false;
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// Automatically re-request wake lock when user switches back to the tab
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRequested) {
      requestWakeLock();
    }
  });
}
