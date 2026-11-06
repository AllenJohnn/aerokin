import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../../server/public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Start static test server
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !path.extname(reqPath)) {
    reqPath = '/index.html';
  }
  const filePath = path.join(publicDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const indexPath = path.join(publicDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
  }
});

const PORT = 5192;
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`[Test Server] Serving ${publicDir} at http://127.0.0.1:${PORT}`);

// Contrast ratio helper
function parseRgb(colorStr) {
  if (!colorStr) return [255, 255, 255];
  const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  }
  if (colorStr.startsWith('#')) {
    const hex = colorStr.replace('#', '');
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  return [255, 255, 255];
}

function getLuminance([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function getContrastRatio(fgRgb, bgRgb) {
  const l1 = getLuminance(fgRgb);
  const l2 = getLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const engines = [
  { name: 'chromium', launcher: chromium },
  { name: 'webkit', launcher: webkit },
];

let allPassed = true;
const results = [];

try {
  for (const { name: engineName, launcher } of engines) {
    console.log(`\n========================================`);
    console.log(`Testing Engine: ${engineName.toUpperCase()} (iPhone 14 emulation)`);
    console.log(`========================================`);

    const browser = await launcher.launch();

    for (const colorScheme of ['dark', 'light']) {
      console.log(`\n-- Testing Color Scheme: ${colorScheme} --`);
      const context = await browser.newContext({
        ...devices['iPhone 14'],
        colorScheme,
      });

      // Part A: Unauthenticated (ManualTokenModal)
      {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${PORT}`);
        await page.waitForLoadState('networkidle');

        // Check if ManualTokenModal inputs are present
        const inputs = await page.locator('input').all();
        console.log(`Found ${inputs.length} inputs on pairing screen`);

        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i];
          const placeholder = await input.getAttribute('placeholder');
          const type = await input.getAttribute('type') || 'text';

          const styles = await input.evaluate((el) => {
            const cs = window.getComputedStyle(el);
            return {
              color: cs.color,
              webkitTextFillColor: cs.webkitTextFillColor,
              backgroundColor: cs.backgroundColor,
              fontSize: cs.fontSize,
              caretColor: cs.caretColor,
            };
          });

          const fgColor = styles.webkitTextFillColor && styles.webkitTextFillColor !== 'rgba(0, 0, 0, 0)'
            ? styles.webkitTextFillColor
            : styles.color;
          const fgRgb = parseRgb(fgColor);
          // If input bg is transparent/dark, effective bg is #0A0A0A or #000000
          let bgRgb = parseRgb(styles.backgroundColor);
          if (styles.backgroundColor.includes('rgba(0, 0, 0, 0)')) {
            bgRgb = [10, 10, 10];
          }

          const ratio = getContrastRatio(fgRgb, bgRgb);
          const fontSizePx = parseFloat(styles.fontSize);
          const isZoomSafe = fontSizePx >= 16;
          const hasGoodContrast = ratio >= 4.5;

          const passed = hasGoodContrast && isZoomSafe;
          if (!passed) allPassed = false;

          results.push({
            engine: engineName,
            colorScheme,
            element: `Pairing Input [${placeholder || type}]`,
            ratio: ratio.toFixed(2),
            fontSize: styles.fontSize,
            passed,
          });

          console.log(
            `  ${passed ? '✓' : '✗'} [${placeholder || type}] Contrast: ${ratio.toFixed(2)}:1 (>=4.5), FontSize: ${styles.fontSize} (>=16px)`
          );

          // Test typing and visibility
          await input.fill('123456');
          const val = await input.inputValue();
          if (val !== '123456') {
            console.error(`    Typing failed for input ${placeholder}`);
            allPassed = false;
          }
        }
        await page.close();
      }

      // Part B: Authenticated (Quick Actions, Clipboard, Settings)
      {
        const page = await context.newPage();

        // Inject authenticated state & Mock WebSocket
        await page.addInitScript(() => {
          localStorage.setItem('aerokin_server_host', '127.0.0.1:8080');
          localStorage.setItem('aerokin_auth_token', '12345678');
          localStorage.setItem('aerokin_device_id', 'dev-iphone-test');
          localStorage.setItem('aerokin_device_credential', 'test_cred_123');
          localStorage.setItem('aerokin_device_name', "Allen's iPhone");

          class MockWebSocket extends EventTarget {
            constructor(url) {
              super();
              this.url = url;
              this.readyState = 1;
              setTimeout(() => {
                if (this.onopen) this.onopen(new Event('open'));
                this.dispatchEvent(new Event('open'));

                const authOk = new MessageEvent('message', {
                  data: JSON.stringify({
                    type: 'auth_ok',
                    deviceId: 'dev-iphone-test',
                    deviceName: "Allen's iPhone",
                    devices: [
                      {
                        id: 'dev-iphone-test',
                        deviceId: 'dev-iphone-test',
                        name: "Allen's iPhone",
                        platform: 'iOS',
                        createdAt: Date.now() - 3600000,
                        lastSeen: Date.now(),
                      },
                      {
                        id: 'dev-ipad',
                        deviceId: 'dev-ipad',
                        name: "Allen's iPad",
                        platform: 'iPadOS',
                        createdAt: Date.now() - 86400000,
                        lastSeen: Date.now(),
                      },
                    ],
                  }),
                });
                if (this.onmessage) this.onmessage(authOk);
                this.dispatchEvent(authOk);
              }, 50);
            }
            send(data) {}
            close() {
              this.readyState = 3;
            }
          }
          window.WebSocket = MockWebSocket;
        });

        await page.goto(`http://127.0.0.1:${PORT}`);
        await page.waitForLoadState('networkidle');

        // 1. Open More -> Quick Actions
        const moreTab = page.locator('button', { hasText: /More/i }).first();
        if (await moreTab.isVisible()) {
          await moreTab.click();
          await page.waitForTimeout(300);

          const qaButton = page.locator('button', { hasText: /Quick Actions/i }).first();
          if (await qaButton.isVisible()) {
            await qaButton.click();
            await page.waitForTimeout(300);

            // Check Quick Actions inputs: Send Link, Type Text
            const qaInputs = await page.locator('input[type="url"], input[placeholder*="Type text"]').all();
            for (const input of qaInputs) {
              const placeholder = await input.getAttribute('placeholder');
              const styles = await input.evaluate((el) => {
                const cs = window.getComputedStyle(el);
                return {
                  color: cs.color,
                  webkitTextFillColor: cs.webkitTextFillColor,
                  backgroundColor: cs.backgroundColor,
                  fontSize: cs.fontSize,
                };
              });
              const fgRgb = parseRgb(styles.webkitTextFillColor || styles.color);
              let bgRgb = parseRgb(styles.backgroundColor);
              if (styles.backgroundColor.includes('rgba(0, 0, 0, 0)')) bgRgb = [10, 10, 10];
              const ratio = getContrastRatio(fgRgb, bgRgb);
              const fontSizePx = parseFloat(styles.fontSize);
              const isZoomSafe = fontSizePx >= 16;
              const hasGoodContrast = ratio >= 4.5;
              const passed = hasGoodContrast && isZoomSafe;
              if (!passed) allPassed = false;

              results.push({
                engine: engineName,
                colorScheme,
                element: `Quick Actions [${placeholder}]`,
                ratio: ratio.toFixed(2),
                fontSize: styles.fontSize,
                passed,
              });

              console.log(
                `  ${passed ? '✓' : '✗'} QA [${placeholder}] Contrast: ${ratio.toFixed(2)}:1, FontSize: ${styles.fontSize}`
              );

              await input.fill('https://example.com');
              const val = await input.inputValue();
              if (val !== 'https://example.com') allPassed = false;
            }
          }

          // 2. Open Clipboard Tab
          const clipButton = page.locator('button', { hasText: /Clipboard/i }).first();
          if (await clipButton.isVisible()) {
            await clipButton.click();
            await page.waitForTimeout(300);

            const textareas = await page.locator('textarea').all();
            for (const ta of textareas) {
              const placeholder = (await ta.getAttribute('placeholder')) || 'pcClipboardText';
              const styles = await ta.evaluate((el) => {
                const cs = window.getComputedStyle(el);
                return {
                  color: cs.color,
                  webkitTextFillColor: cs.webkitTextFillColor,
                  backgroundColor: cs.backgroundColor,
                  fontSize: cs.fontSize,
                };
              });
              const fgRgb = parseRgb(styles.webkitTextFillColor || styles.color);
              let bgRgb = parseRgb(styles.backgroundColor);
              if (styles.backgroundColor.includes('rgba(0, 0, 0, 0)')) bgRgb = [10, 10, 10];
              const ratio = getContrastRatio(fgRgb, bgRgb);
              const fontSizePx = parseFloat(styles.fontSize);
              const isZoomSafe = fontSizePx >= 16;
              const hasGoodContrast = ratio >= 4.5;
              const passed = hasGoodContrast && isZoomSafe;
              if (!passed) allPassed = false;

              results.push({
                engine: engineName,
                colorScheme,
                element: `Clipboard [${placeholder.slice(0, 20)}]`,
                ratio: ratio.toFixed(2),
                fontSize: styles.fontSize,
                passed,
              });

              console.log(
                `  ${passed ? '✓' : '✗'} Clipboard [${placeholder.slice(0, 20)}] Contrast: ${ratio.toFixed(2)}:1, FontSize: ${styles.fontSize}`
              );
            }
          }
        }

        await page.close();
      }

      await context.close();
    }

    await browser.close();
  }
} finally {
  server.close();
}

console.log('\n========================================');
console.log('SUMMARY OF FORM FIELD VISIBILITY AUDIT:');
console.log('========================================');
console.table(results);

if (!allPassed) {
  console.error('\nFAIL: Some form fields failed contrast or iOS auto-zoom guard (16px minimum).');
  process.exit(1);
} else {
  console.log('\nPASS: All form fields passed >= 4.5:1 contrast and iOS zoom prevention across Chromium & WebKit in light and dark mode!');
  process.exit(0);
}
