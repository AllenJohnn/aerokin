import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../../docs/screenshots');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

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

// Start a lightweight static server for dist
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !path.extname(reqPath)) {
    reqPath = '/index.html';
  }
  const filePath = path.join(distDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA catch-all
    const indexPath = path.join(distDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
  }
});

await new Promise((resolve) => server.listen(5199, '127.0.0.1', resolve));
console.log('Static server listening on http://127.0.0.1:5199');

try {
  const browser = await chromium.launch();

  // Test targets
  const viewports = [
    { name: '390x844', width: 390, height: 844, scale: 3, label: 'iPhone 14 (390x844@3x)' },
    { name: '360x740', width: 360, height: 740, scale: 1, label: 'Compact Mobile (360x740)' },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
    });

    // Provide mock authenticated device and media session
    await context.addInitScript(() => {
      localStorage.setItem('aerokin_server_host', '127.0.0.1:8080');
      localStorage.setItem('aerokin_auth_token', '12345678');
      localStorage.setItem('aerokin_device_id', 'dev-mock-iphone');
      localStorage.setItem('aerokin_device_credential', 'mock_credential_123');
      localStorage.setItem('aerokin_device_name', "Allen's iPhone 14");

      window.DeviceMotionEvent = {
        requestPermission: async () => 'granted',
      };

      class MockWebSocket extends EventTarget {
        constructor(url) {
          super();
          this.url = url;
          this.readyState = 1;
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event('open'));
            this.dispatchEvent(new Event('open'));

            // Send auth confirmation
            const authOkMsg = new MessageEvent('message', {
              data: JSON.stringify({
                type: 'auth_ok',
                deviceId: 'dev-mock-iphone',
                deviceName: "Allen's iPhone 14",
                devices: [
                  {
                    id: 'dev-mock-iphone',
                    name: "Allen's iPhone 14",
                    platform: 'iOS (Safari PWA)',
                    createdAt: Date.now() - 3600000,
                    lastSeen: Date.now(),
                    isCurrent: true,
                  },
                ],
              }),
            });
            if (this.onmessage) this.onmessage(authOkMsg);
            this.dispatchEvent(authOkMsg);

            // Send active media status
            const mediaMsg = new MessageEvent('message', {
              data: JSON.stringify({
                type: 'media_status',
                status: 'playing',
                app: 'Spotify',
                title: 'Midnight City',
                artist: 'M83',
                position: 134,
                duration: 243,
                canSeek: true,
                canNext: true,
                canPrev: true,
                capabilities: {
                  canPlay: true,
                  canPause: true,
                  canTogglePlayPause: true,
                  canNext: true,
                  canPrev: true,
                  canStop: true,
                  canSeek: true,
                  canSetPosition: true,
                },
                sessions: [
                  { id: 'spotify-1', app: 'Spotify', title: 'Midnight City - M83', isActive: true },
                  { id: 'youtube-1', app: 'YouTube', title: 'Synthwave Radio 24/7', isActive: false },
                ],
                volume: 72,
                muted: false,
              }),
            });
            if (this.onmessage) this.onmessage(mediaMsg);
            this.dispatchEvent(mediaMsg);
          }, 60);
        }
        send() {}
        close() {
          this.readyState = 3;
          if (this.onclose) this.onclose(new CloseEvent('close'));
          this.dispatchEvent(new CloseEvent('close'));
        }
      }
      window.WebSocket = MockWebSocket;
    });

    const page = await context.newPage();

    await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // If hosted connect button appears, tap it to initiate connection
    const connectBtn = page.locator('button:has-text("Connect to PC")');
    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      await page.waitForTimeout(300);
    }

    // Dismiss motion permission screen if shown on iOS
    const motionBtn = page.locator('button:has-text("Enable motion")');
    try {
      await motionBtn.waitFor({ state: 'visible', timeout: 2000 });
      await motionBtn.click();
      await page.waitForTimeout(400);
    } catch {
      // Not shown or already granted
    }

    // 1. Navigate to Media Tab first
    const mediaTabBtn = page.locator('button:has-text("Media")');
    await mediaTabBtn.waitFor({ state: 'visible', timeout: 5000 });
    await mediaTabBtn.click();
    await page.waitForTimeout(400);

    // Verify horizontal overflow on Media tab
    const mediaOverflowCheck = await page.evaluate(() => {
      const body = document.body;
      const main = document.querySelector('main');
      return {
        bodyHasOverflow: body.scrollWidth > body.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        bodyClientWidth: body.clientWidth,
        mainHasOverflow: main ? main.scrollWidth > main.clientWidth : false,
      };
    });

    console.log(`[${vp.label}] Media tab overflow check:`, mediaOverflowCheck);

    const suffix = vp.scale === 3 ? '@3x' : '';
    const mediaScreenshotPath = path.join(outDir, `media-tab-${vp.name}${suffix}.png`);
    await page.screenshot({ path: mediaScreenshotPath });
    console.log(`Saved Media tab screenshot: ${mediaScreenshotPath}`);

    // 2. Open settings drawer
    const settingsBtn = page.locator('button[aria-label="Settings"]');
    await settingsBtn.waitFor({ state: 'visible', timeout: 5000 });
    await settingsBtn.click();

    // Wait for drawer sheet
    const drawer = page.locator('[role="dialog"]');
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(400); // Allow sheet open animation to settle

    // Locate Trackpad section header
    const trackpadHeader = page.locator('h3:has-text("Trackpad")');
    await trackpadHeader.waitFor({ state: 'visible', timeout: 5000 });
    await trackpadHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // Verify horizontal overflow
    const overflowCheck = await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (!el) return { hasOverflow: false, clientWidth: 0, scrollWidth: 0 };
      return {
        hasOverflow: el.scrollWidth > el.clientWidth,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        bodyHasOverflow: document.body.scrollWidth > document.body.clientWidth,
      };
    });

    console.log(`[${vp.label}] Overflow check:`, overflowCheck);

    // Screenshot of trackpad section in drawer
    const screenshotPath = path.join(outDir, `settings-trackpad-${vp.name}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot: ${screenshotPath}`);

    // Toggle momentum ON to verify decay slider
    const momentumSwitch = page.locator('button[aria-label="Momentum scrolling"]');
    await momentumSwitch.click();
    await page.waitForTimeout(200);

    const momentumDecayLabel = page.locator('span:has-text("Momentum decay")');
    const isDecayVisible = await momentumDecayLabel.isVisible();
    console.log(`[${vp.label}] Momentum decay slider visible:`, isDecayVisible);

    const momentumScreenshotPath = path.join(outDir, `settings-trackpad-${vp.name}-momentum.png`);
    await page.screenshot({ path: momentumScreenshotPath });
    console.log(`Saved momentum screenshot: ${momentumScreenshotPath}`);

    // Locate Devices & Security section header
    const securityHeader = page.locator('h3:has-text("Devices & Security")');
    if (await securityHeader.isVisible()) {
      await securityHeader.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      const securityOverflowCheck = await page.evaluate(() => {
        const el = document.querySelector('[role="dialog"] .overflow-y-auto');
        if (!el) return { hasOverflow: false, clientWidth: 0, scrollWidth: 0 };
        return {
          hasOverflow: el.scrollWidth > el.clientWidth,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
        };
      });

      console.log(`[${vp.label}] Security section overflow check:`, securityOverflowCheck);

      const secScreenshotPath = path.join(
        outDir,
        `settings-devices-security-${vp.name}${suffix}.png`
      );
      await page.screenshot({ path: secScreenshotPath });
      console.log(`Saved security screenshot: ${secScreenshotPath}`);
    }

    await context.close();
  }

  await browser.close();
  console.log('Screenshots completed successfully!');
} finally {
  server.close();
}
