/**
 * Hardware Volume Rocker Button Interceptor for iOS & Android Browsers
 *
 * Browsers do not expose raw hardware button events for Volume Up / Volume Down.
 * However, playing an inaudible silent audio loop routes device volume buttons to
 * the page's HTMLMediaElement. Listening to the `volumechange` event and resetting
 * the volume to 0.5 enables continuous detection of physical volume button clicks.
 */

export interface HardwareVolumeOptions {
  onVolumeUp: () => void;
  onVolumeDown: () => void;
}

// 1-second 8kHz mono silent PCM WAV data URI
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export function setupHardwareVolumeListener(options: HardwareVolumeOptions): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let audio: HTMLAudioElement | null = null;
  let isResetting = false;

  const handleVolumeChange = () => {
    if (!audio || isResetting) return;

    const current = audio.volume;
    if (current > 0.51) {
      options.onVolumeUp();
      isResetting = true;
      audio.volume = 0.5;
      setTimeout(() => {
        isResetting = false;
      }, 50);
    } else if (current < 0.49) {
      options.onVolumeDown();
      isResetting = true;
      audio.volume = 0.5;
      setTimeout(() => {
        isResetting = false;
      }, 50);
    }
  };

  const startAudio = () => {
    if (!audio) {
      audio = new Audio(SILENT_WAV);
      audio.loop = true;
      audio.volume = 0.5;
      audio.addEventListener('volumechange', handleVolumeChange);
    }

    if (audio.paused) {
      audio.play().catch(() => {
        // Autoplay may be restricted until user touches the screen
      });
    }
  };

  // Start on first user interaction
  const handleUserGesture = () => {
    startAudio();
    window.removeEventListener('touchstart', handleUserGesture);
    window.removeEventListener('pointerdown', handleUserGesture);
    window.removeEventListener('click', handleUserGesture);
  };

  window.addEventListener('touchstart', handleUserGesture, { passive: true });
  window.addEventListener('pointerdown', handleUserGesture, { passive: true });
  window.addEventListener('click', handleUserGesture, { passive: true });

  return () => {
    window.removeEventListener('touchstart', handleUserGesture);
    window.removeEventListener('pointerdown', handleUserGesture);
    window.removeEventListener('click', handleUserGesture);

    if (audio) {
      audio.removeEventListener('volumechange', handleVolumeChange);
      audio.pause();
      audio = null;
    }
  };
}
