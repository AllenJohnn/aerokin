/**
 * Tactile & Detent Haptics for iOS Safari & Android
 * Uses navigator.vibrate when available with fallback to iOS switch tap trick.
 */

let hapticElement: HTMLInputElement | null = null;

export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'detent' | 'success' | 'alert' = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (type === 'detent') {
        navigator.vibrate(6);
      } else if (type === 'light') {
        navigator.vibrate(10);
      } else if (type === 'medium') {
        navigator.vibrate(18);
      } else if (type === 'heavy') {
        navigator.vibrate(28);
      } else if (type === 'success') {
        navigator.vibrate([12, 40, 18]);
      } else if (type === 'alert') {
        navigator.vibrate([25, 30, 25]);
      }
    }

    // iOS 17.4+ Safari switch haptic trick
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
    // Silently ignore
  }
}
