import { Win32Input } from '../src/native/win32.js';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('--- Testing Native Win32 Input ---');

  if (!Win32Input.isSupported()) {
    console.log('[Notice] Win32Input is not supported on this platform or user32 could not be loaded.');
    process.exit(0);
  }

  const startPos = Win32Input.getCursorPosition();
  console.log('Initial cursor position:', startPos);

  if (!startPos) {
    console.log('[Notice] Could not read cursor position (desktop may be inactive or running in headless sandbox).');
    process.exit(0);
  }

  console.log('Moving cursor in a 100px square...');

  // 1. Right (+100, 0)
  Win32Input.moveRelative(100, 0);
  await sleep(150);
  const p1 = Win32Input.getCursorPosition();
  console.log('1. Move Right (+100):', p1);

  // 2. Down (0, +100)
  Win32Input.moveRelative(0, 100);
  await sleep(150);
  const p2 = Win32Input.getCursorPosition();
  console.log('2. Move Down (+100):', p2);

  // 3. Left (-100, 0)
  Win32Input.moveRelative(-100, 0);
  await sleep(150);
  const p3 = Win32Input.getCursorPosition();
  console.log('3. Move Left (-100):', p3);

  // 4. Up (0, -100)
  Win32Input.moveRelative(0, -100);
  await sleep(150);
  const p4 = Win32Input.getCursorPosition();
  console.log('4. Move Up (-100) back to start:', p4);

  // Test foreground detection
  const fg = Win32Input.getForegroundApp();
  console.log('\nCurrent Foreground Window:');
  console.log(' - Title:', fg?.title || '(none)');
  console.log(' - Process:', fg?.processName || '(none)');

  console.log('\n✔ Input test completed successfully!');
}

main().catch((err) => {
  console.error('Test input failed:', err);
  process.exit(1);
});
