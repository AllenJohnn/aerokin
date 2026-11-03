/**
 * Best-effort haptics for iOS 17.4+ Safari and standard mobile browsers.
 * Uses the hidden <input type="checkbox" switch> trick on iOS Safari,
 * with fallback to navigator.vibrate. Silently ignores if unsupported.
 */

let hapticElement: HTMLInputElement | null = null;

export function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    // 1. Standard Vibration API (Android / desktop chrome)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const duration = type === 'heavy' ? 25 : type === 'medium' ? 15 : 8;
      navigator.vibrate(duration);
    }

    // 2. iOS 17.4+ Safari switch haptics trick
    if (typeof document !== 'undefined') {
      if (!hapticElement) {
        hapticElement = document.createElement('input');
        hapticElement.id = 'aerokin-haptic-switch';
        hapticElement.type = 'checkbox';
        hapticElement.setAttribute('switch', '');
        hapticElement.style.position = 'fixed';
        hapticElement.style.top = '-9999px';
        hapticElement.style.left = '-9999px';
        hapticElement.style.opacity = '0';
        hapticElement.style.pointerEvents = 'none';
        document.body.appendChild(hapticElement);
      }
      hapticElement.click();
    }
  } catch {
    // Silently ignore if unsupported
  }
}
