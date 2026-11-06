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

  // Dashboard REST mock endpoints
  if (reqPath === '/api/dashboard/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        cpu: { totalPercent: 16.4, cores: [14, 18, 12, 22, 15, 10, 24, 16] },
        agentCpuPercent: 0.018,
        memory: { usedBytes: 8.8 * 1e9, totalBytes: 16.0 * 1e9, usedPercent: 55.0 },
        disks: [
          { mount: 'C:', totalGb: 512, usedGb: 245, freeGb: 267, percent: 47.8 },
          { mount: 'D:', totalGb: 1024, usedGb: 420, freeGb: 604, percent: 41.0 },
        ],
        network: { rxRateKbps: 1240.5, txRateKbps: 185.2 },
        power: { hasBattery: true, batteryPercent: 88, isCharging: true },
        gpu: { available: true, utilization: 21.5 },
        temperatures: { available: false, main: null },
      })
    );
    return;
  }

  if (reqPath === '/api/dashboard/actions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        recent: [
          { action: 'lock_workstation', time: Date.now() - 45000, success: true },
          { action: 'type_text', time: Date.now() - 120000, success: true },
          { action: 'volume_mute', time: Date.now() - 300000, success: true },
          { action: 'launch_app', time: Date.now() - 600000, success: true },
          { action: 'show_desktop', time: Date.now() - 900000, success: true },
        ],
        countdown: {
          active: true,
          action: 'shutdown',
          secondsRemaining: 8,
        },
        launcherEntries: [
          { id: 'notepad', name: 'Notepad', path: 'notepad.exe' },
          { id: 'terminal', name: 'Windows Terminal', path: 'wt.exe' },
        ],
      })
    );
    return;
  }

  if (reqPath === '/api/dashboard/features') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        clipboard: true,
        screenshot: true,
        quickActions: true,
        launcher: true,
      })
    );
    return;
  }

  if (reqPath === '/api/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        entries: [
          {
            id: 'log-1',
            timestamp: Date.now() - 12000,
            level: 'info',
            category: 'actions',
            message: 'Executed quick action: lock_workstation',
          },
          {
            id: 'log-2',
            timestamp: Date.now() - 8000,
            level: 'info',
            category: 'clipboard',
            message: 'PC clipboard read. Length: 42 chars.',
          },
          {
            id: 'log-3',
            timestamp: Date.now() - 4000,
            level: 'warn',
            category: 'actions',
            message: 'Initiated 10-second cancelable countdown for dangerous action: shutdown',
          },
        ],
      })
    );
    return;
  }

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
    const indexPath = path.join(distDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
  }
});

const PORT = 5210;
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`Test static server listening on http://127.0.0.1:${PORT}`);

try {
  const browser = await chromium.launch();

  // Test targets
  const viewports = [
    { name: '390x844', width: 390, height: 844, scale: 3, label: 'iPhone 14 (390x844@3x)' },
    { name: '360x740', width: 360, height: 740, scale: 1, label: 'Compact Mobile (360x740)' },
  ];

  for (const vp of viewports) {
    const suffix = vp.scale === 3 ? '@3x' : '';
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
    });

    // Mock client state and websocket
    await context.addInitScript(() => {
      localStorage.setItem('aerokin_server_host', '127.0.0.1:8080');
      localStorage.setItem('aerokin_auth_token', '12345678');
      localStorage.setItem('aerokin_device_id', 'dev-mock-iphone');
      localStorage.setItem('aerokin_device_credential', 'mock_credential_123');
      localStorage.setItem('aerokin_device_name', "Allen's iPhone 14");
      localStorage.setItem(
        'aerokin_nav_config',
        JSON.stringify({
          version: 1,
          pinned: ['desktop', 'trackpad', 'media', 'more'],
          defaultTab: 'more',
        })
      );

      class MockWebSocket extends EventTarget {
        constructor(url) {
          super();
          this.url = url;
          this.readyState = 1;
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event('open'));
            this.dispatchEvent(new Event('open'));

            // Send auth ok
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

            // Send feature flags
            const featMsg = new MessageEvent('message', {
              data: JSON.stringify({
                type: 'features_status',
                flags: { clipboard: true, screenshot: true, quickActions: true, launcher: true },
              }),
            });
            if (this.onmessage) this.onmessage(featMsg);
            this.dispatchEvent(featMsg);

            // Send launcher list
            const launchMsg = new MessageEvent('message', {
              data: JSON.stringify({
                type: 'launcher_list',
                entries: [
                  { id: 'notepad', name: 'Notepad', description: 'Windows Text Editor' },
                  { id: 'terminal', name: 'Windows Terminal', description: 'PowerShell / CMD' },
                  { id: 'browser', name: 'Default Browser', description: 'Open primary browser' },
                  { id: 'vlc', name: 'VLC Media Player', description: 'Media player' },
                ],
              }),
            });
            if (this.onmessage) this.onmessage(launchMsg);
            this.dispatchEvent(launchMsg);

            // Send sample screenshot
            const samplePng =
              'iVBORw0KGgoAAAANSUhEUgAAAlgAAAGQCAYAAAByNR6YAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAA' +
              'GXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54' +
              'bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlk' +
              'Ij8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhN' +
              'UCBDb3JlIDUuMC1jMDYwIDYxLjEzNDI3NywgMjAxMC8wOC8xMi0xNzo0MDowNCAgICAgICAgIj4g' +
              'PHJkZjpSREYgeG1sbnM6cmRmPSdodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50' +
              'YXgtbnMjJz4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycgeG1sbnM6eG1wPSdodHRwOi8v' +
              'bnMuYWRvYmUuY29tL3hhcC8xLjAvJz4gPHhtcDpDcmVhdG9yVG9vbD5BZG9iZSBQaG90b3Nob3Ag' +
              'Q1M1IFdpbmRvd3M8L3htcDpDcmVhdG9yVG9vbD4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJE' +
              'Rj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz6z+f/aAAAE+ElEQVR42uzBAQEAAACC' +
              'IP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgNze/AAEB6r2lXgAAAABJRU5ErkJggg==';

            const shotMsg = new MessageEvent('message', {
              data: JSON.stringify({
                type: 'screenshot_data',
                success: true,
                mimeType: 'image/png',
                data: samplePng,
                width: 1920,
                height: 1080,
                sizeBytes: 154200,
                downscaled: false,
              }),
            });
            if (this.onmessage) this.onmessage(shotMsg);
            this.dispatchEvent(shotMsg);

            // Send clipboard
            const clipMsg = new MessageEvent('message', {
              data: JSON.stringify({
                type: 'clipboard_text',
                text: 'https://aerokin.local:8080/#code=93821045',
                length: 42,
              }),
            });
            if (this.onmessage) this.onmessage(clipMsg);
            this.dispatchEvent(clipMsg);

            // Send system stats
            const statsMsg = new MessageEvent('message', {
              data: JSON.stringify({
                type: 'system_stats',
                timestamp: Date.now(),
                uptimeSeconds: 86400 * 2 + 3600 * 4 + 120,
                cpu: {
                  totalPercent: 14.8,
                  coresPercent: [12, 18, 9, 22, 14, 11, 25, 8],
                  agentCpuPercent: 0.015,
                },
                ram: {
                  usedBytes: 8.4 * 1024 * 1024 * 1024,
                  totalBytes: 16.0 * 1024 * 1024 * 1024,
                  percent: 52.5,
                },
                disks: [
                  {
                    drive: 'C:',
                    totalBytes: 512 * 1024 * 1024 * 1024,
                    usedBytes: 245 * 1024 * 1024 * 1024,
                    freeBytes: 267 * 1024 * 1024 * 1024,
                    percent: 47.8,
                  },
                  {
                    drive: 'D:',
                    totalBytes: 1024 * 1024 * 1024 * 1024,
                    usedBytes: 420 * 1024 * 1024 * 1024,
                    freeBytes: 604 * 1024 * 1024 * 1024,
                    percent: 41.0,
                  },
                ],
                network: {
                  upBytesPerSec: 142 * 1024,
                  downBytesPerSec: 1250 * 1024,
                },
                power: {
                  hasBattery: true,
                  batteryPercent: 88,
                  isCharging: true,
                  acConnected: true,
                },
                gpu: {
                  available: true,
                  utilizationPercent: 18.2,
                  note: 'Direct3D Engine 0',
                },
                temperature: {
                  available: false,
                  celsius: null,
                  note: 'Not available (driver-free)',
                },
                topProcesses: {
                  byCpu: [
                    { name: 'chrome.exe', value: '4.8%' },
                    { name: 'Code.exe', value: '3.2%' },
                    { name: 'aerokin-agent.exe', value: '0.02%' },
                    { name: 'Spotify.exe', value: '1.1%' },
                    { name: 'explorer.exe', value: '0.9%' },
                  ],
                  byRam: [
                    { name: 'chrome.exe', value: '1420 MB' },
                    { name: 'Code.exe', value: '880 MB' },
                    { name: 'Spotify.exe', value: '420 MB' },
                    { name: 'explorer.exe', value: '210 MB' },
                    { name: 'aerokin-agent.exe', value: '48 MB' },
                  ],
                },
              }),
            });
            if (this.onmessage) this.onmessage(statsMsg);
            this.dispatchEvent(statsMsg);
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
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // If hosted connect button appears, tap it to connect
    const connectBtn = page.locator('button:has-text("Connect to PC"), button:has-text("Connect")');
    if (await connectBtn.first().isVisible()) {
      await connectBtn.first().click();
      await page.waitForTimeout(600);
    }

    // Verify overflow helper
    const checkOverflow = async (label) => {
      const result = await page.evaluate(() => {
        return {
          hasOverflow: document.body.scrollWidth > document.body.clientWidth,
          scrollWidth: document.body.scrollWidth,
          clientWidth: document.body.clientWidth,
        };
      });
      console.log(`[${vp.label}] ${label} overflow:`, result);
      return result;
    };

    // 1. More Launcher screen
    const moreTabBtn = page.locator('button[role="tab"]:has-text("More")');
    if (await moreTabBtn.isVisible()) {
      await moreTabBtn.click();
      await page.waitForTimeout(500);
    }
    await checkOverflow('More Launcher');
    const moreScreenshotPath = path.join(outDir, `more-launcher-${vp.name}${suffix}.png`);
    await page.screenshot({ path: moreScreenshotPath });
    console.log(`Saved More Launcher screenshot: ${moreScreenshotPath}`);

    // 2. Screenshot Tool screen
    const captureTile = page.locator('button:has-text("Screenshot")').first();
    await captureTile.waitFor({ state: 'visible', timeout: 5000 });
    await captureTile.click();
    await page.waitForTimeout(600);
    await checkOverflow('Screenshot Tool');
    const shotPath = path.join(outDir, `screenshot-tool-${vp.name}${suffix}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`Saved Screenshot Tool screenshot: ${shotPath}`);

    // Back to more
    const backBtn1 = page.locator('button[aria-label="Back to More menu"]');
    if (await backBtn1.isVisible()) {
      await backBtn1.click();
      await page.waitForTimeout(400);
    }

    // 3. System Monitor screen
    const systemTile = page.locator('button:has-text("System Monitor")').first();
    await systemTile.waitFor({ state: 'visible', timeout: 5000 });
    await systemTile.click();
    await page.waitForTimeout(600);
    await checkOverflow('System Monitor');
    const sysPath = path.join(outDir, `system-monitor-${vp.name}${suffix}.png`);
    await page.screenshot({ path: sysPath });
    console.log(`Saved System Monitor screenshot: ${sysPath}`);

    // Back to more
    const backBtn2 = page.locator('button[aria-label="Back to More menu"]');
    if (await backBtn2.isVisible()) {
      await backBtn2.click();
      await page.waitForTimeout(400);
    }

    // 4. Clipboard Sync screen
    const clipTile = page.locator('button:has-text("Clipboard")').first();
    await clipTile.waitFor({ state: 'visible', timeout: 5000 });
    await clipTile.click();
    await page.waitForTimeout(600);
    await checkOverflow('Clipboard Sync');
    const clipPath = path.join(outDir, `clipboard-sync-${vp.name}${suffix}.png`);
    await page.screenshot({ path: clipPath });
    console.log(`Saved Clipboard Sync screenshot: ${clipPath}`);

    // Back to more
    const backBtn3 = page.locator('button[aria-label="Back to More menu"]');
    if (await backBtn3.isVisible()) {
      await backBtn3.click();
      await page.waitForTimeout(400);
    }

    // 5. Quick Actions screen (and dangerous shutdown confirmation sheet)
    const actionsTile = page.locator('button:has-text("Quick Actions")').first();
    await actionsTile.waitFor({ state: 'visible', timeout: 5000 });
    await actionsTile.click();
    await page.waitForTimeout(600);
    await checkOverflow('Quick Actions');
    const actPath = path.join(outDir, `quick-actions-${vp.name}${suffix}.png`);
    await page.screenshot({ path: actPath });
    console.log(`Saved Quick Actions screenshot: ${actPath}`);

    // Trigger Shutdown action to open confirmation sheet
    const shutdownBtn = page.locator('button:has-text("Shutdown")');
    if (await shutdownBtn.isVisible()) {
      await shutdownBtn.click();
      await page.waitForTimeout(500);
      await checkOverflow('Shutdown Confirm Sheet');
      const confirmPath = path.join(outDir, `quick-actions-shutdown-confirm-${vp.name}${suffix}.png`);
      await page.screenshot({ path: confirmPath });
      console.log(`Saved Shutdown Confirm Sheet screenshot: ${confirmPath}`);

      // Dismiss confirmation sheet
      const cancelBtn = page.locator('div.fixed button:has-text("Cancel")');
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click({ force: true });
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(400);
    }

    // Back to more
    const backBtn4 = page.locator('button[aria-label="Back to More menu"]');
    if (await backBtn4.isVisible()) {
      await backBtn4.click();
      await page.waitForTimeout(400);
    }

    // 6. Presentation Remote screen
    const presentTile = page.locator('button:has-text("Presentation Remote")').first();
    await presentTile.waitFor({ state: 'visible', timeout: 5000 });
    await presentTile.click();
    await page.waitForTimeout(600);
    await checkOverflow('Presentation Remote');
    const presPath = path.join(outDir, `present-remote-${vp.name}${suffix}.png`);
    await page.screenshot({ path: presPath });
    console.log(`Saved Presentation Remote screenshot: ${presPath}`);

    // Back to more
    const backBtn5 = page.locator('button[aria-label="Back to More menu"]');
    if (await backBtn5.isVisible()) {
      await backBtn5.click();
      await page.waitForTimeout(400);
    }

    // 7. Settings Drawer and subpages (Navigation, Connections, Trackpad)
    const settingsBtn = page.locator('button[aria-label="Settings"]');
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
      await checkOverflow('Settings Menu');
      const setMenuPath = path.join(outDir, `settings-menu-${vp.name}${suffix}.png`);
      await page.screenshot({ path: setMenuPath });
      console.log(`Saved Settings Menu screenshot: ${setMenuPath}`);

      // Open Navigation page
      const navItem = page.locator('button:has-text("Navigation & Launcher")');
      if (await navItem.isVisible()) {
        await navItem.click();
        await page.waitForTimeout(400);
        await checkOverflow('Settings Navigation');
        const setNavPath = path.join(outDir, `settings-navigation-${vp.name}${suffix}.png`);
        await page.screenshot({ path: setNavPath });
        console.log(`Saved Settings Navigation screenshot: ${setNavPath}`);
      }

      // Close settings
      const closeSettings = page.locator('button:has-text("Done")');
      if (await closeSettings.isVisible()) await closeSettings.click();
      await page.waitForTimeout(300);
    }

    await context.close();
  }

  // 8. PC Desktop Dashboard (1440x900)
  const pcContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  await pcContext.addInitScript(() => {
    // Mock EventSource for /api/dashboard/events
    class MockEventSource extends EventTarget {
      constructor(url) {
        super();
        this.url = url;
        setTimeout(() => {
          if (this.onopen) this.onopen(new Event('open'));
          this.dispatchEvent(new Event('open'));

          // Send init event
          const initEv = new MessageEvent('init', {
            data: JSON.stringify({
              devices: [
                {
                  deviceId: 'dev-mock-iphone',
                  name: "Allen's iPhone 14",
                  platform: 'iOS (Safari PWA)',
                  isConnected: true,
                  clientIp: '192.168.1.55',
                  currentLatency: 4.8,
                  latencyHistory: [5.2, 5.0, 4.8, 4.6, 4.9, 4.8],
                  battery: { percent: 88, charging: true },
                },
              ],
              pairing: { code: '93821045', expiresInSeconds: 95 },
              pc: {
                hostname: 'ALLEN-LAPTOP',
                lanIp: '192.168.1.55',
                port: 8080,
                uptime: 172800,
                power: {
                  hasBattery: true,
                  batteryPercent: 88,
                  isCharging: true,
                  acConnected: true,
                },
              },
              systemStats: {
                cpu: { totalPercent: 14.8, cores: [12, 18, 9, 22, 14, 11, 25, 8] },
                agentCpuPercent: 0.015,
                memory: { usedBytes: 8.4 * 1e9, totalBytes: 16.0 * 1e9, usedPercent: 52.5 },
                disks: [
                  { mount: 'C:', totalGb: 512, usedGb: 245, freeGb: 267, percent: 47.8 },
                  { mount: 'D:', totalGb: 1024, usedGb: 420, freeGb: 604, percent: 41.0 },
                ],
                network: { rxRateKbps: 1250.0, txRateKbps: 142.0 },
                power: { hasBattery: true, batteryPercent: 88, isCharging: true },
                gpu: { available: true, utilization: 18.2 },
                temperatures: { available: false, main: null },
              },
              actions: {
                recent: [
                  { action: 'lock_workstation', time: Date.now() - 45000, success: true },
                  { action: 'type_text', time: Date.now() - 120000, success: true },
                  { action: 'volume_mute', time: Date.now() - 300000, success: true },
                  { action: 'launch_app', time: Date.now() - 600000, success: true },
                  { action: 'show_desktop', time: Date.now() - 900000, success: true },
                ],
                countdown: {
                  active: true,
                  action: 'shutdown',
                  secondsRemaining: 9,
                },
              },
              features: {
                clipboard: true,
                screenshot: true,
                quickActions: true,
                launcher: true,
              },
              clipboardSharedCount: 4,
            }),
          });
          this.dispatchEvent(initEv);
        }, 100);
      }
      close() {}
    }
    window.EventSource = MockEventSource;
  });

  const pcPage = await pcContext.newPage();
  await pcPage.goto(`http://127.0.0.1:${PORT}/dashboard`, { waitUntil: 'networkidle' });
  await pcPage.waitForTimeout(800);

  const pcDashboardPath = path.join(outDir, 'pc-dashboard-system-actions-1440x900.png');
  await pcPage.screenshot({ path: pcDashboardPath });
  console.log(`Saved PC Dashboard screenshot: ${pcDashboardPath}`);

  await pcContext.close();
  await browser.close();
  console.log('All screenshots captured successfully!');
} finally {
  server.close();
}
