import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function waitForHealth(url, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const req = https.get(url, { rejectUnauthorized: false }, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      });
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error(`Server health check timed out after ${maxAttempts} attempts`));
        }
      });
      req.end();
    }, 500);
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkNoOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    return {
      docScrollWidth: docEl.scrollWidth,
      docClientWidth: docEl.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      hasOverflow: docEl.scrollWidth > docEl.clientWidth || body.scrollWidth > body.clientWidth,
    };
  });

  if (overflow.hasOverflow) {
    console.error(`[OVERFLOW ERROR] ${label}: scrollWidth exceeds clientWidth!`, overflow);
    throw new Error(`Horizontal overflow detected in ${label}`);
  }
}

async function run() {
  console.log('--- Starting Aerokin Server for Playwright Verification ---');

  const certsDir = path.join(ROOT_DIR, 'server/.certs');
  const tokenFile = path.join(certsDir, 'token.txt');
  let token = '4EA378';
  if (fs.existsSync(tokenFile)) {
    token = fs.readFileSync(tokenFile, 'utf8').trim();
  }

  // Pre-register test device in devices.json for instant authenticated connection
  const testDeviceId = 'dev_playwright_test';
  const testRawCredential = 'playwright_credential_secret_12345';
  const testHash = crypto.createHash('sha256').update(testRawCredential).digest('hex');
  const devicesFile = path.join(certsDir, 'devices.json');

  let originalDevicesContent = null;
  if (fs.existsSync(devicesFile)) {
    originalDevicesContent = fs.readFileSync(devicesFile, 'utf8');
  }

  let devicesList = [];
  if (originalDevicesContent) {
    try {
      devicesList = JSON.parse(originalDevicesContent);
    } catch {}
  }
  const existingIdx = devicesList.findIndex((d) => d.deviceId === testDeviceId);
  const testRecord = {
    deviceId: testDeviceId,
    name: 'Playwright iPhone',
    platform: 'iOS',
    credentialHash: testHash,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    revoked: false,
  };
  if (existingIdx >= 0) {
    devicesList[existingIdx] = testRecord;
  } else {
    devicesList.push(testRecord);
  }
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }
  fs.writeFileSync(devicesFile, JSON.stringify(devicesList, null, 2), 'utf8');

  const serverProcess = spawn('node', ['server/dist/index.js'], {
    cwd: ROOT_DIR,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => {
    process.stdout.write(`[Server] ${d}`);
  });
  serverProcess.stderr.on('data', (d) => {
    process.stderr.write(`[Server Err] ${d}`);
  });

  console.log('Waiting for server /health to become active...');
  await waitForHealth('https://127.0.0.1:8443/health');
  console.log('✓ Server is active on https://127.0.0.1:8443');

  console.log('\n--- Launching Chromium with Playwright ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors'],
  });

  try {
    // =========================================================================
    // 1. DESKTOP DASHBOARDS (1440x900 & 1280x720)
    // =========================================================================
    const desktopViewports = [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1280x720', width: 1280, height: 720 },
    ];

    for (const dvp of desktopViewports) {
      console.log(`\nCapturing Desktop Dashboard (${dvp.name})...`);
      const desktopContext = await browser.newContext({
        viewport: { width: dvp.width, height: dvp.height },
        deviceScaleFactor: 1,
        ignoreHTTPSErrors: true,
      });

      const page = await desktopContext.newPage();
      await page.goto(`https://127.0.0.1:8443/?token=${token}`, {
        waitUntil: 'networkidle',
      });
      await sleep(1000);
      await checkNoOverflow(page, `Desktop Dashboard ${dvp.name}`);

      const filename = path.join(SCREENSHOTS_DIR, `desktop-${dvp.name}.png`);
      await page.screenshot({ path: filename });
      console.log(`✓ Saved: ${filename}`);
      await desktopContext.close();
    }

    // =========================================================================
    // 2. MOBILE VIEWPORTS: 390x844 @ 3x (iPhone) and 360x740 (Android/Compact)
    // =========================================================================
    const mobileViewports = [
      { name: '390x844-3x', width: 390, height: 844, dpr: 3 },
      { name: '360x740-1x', width: 360, height: 740, dpr: 1 },
    ];

    for (const vp of mobileViewports) {
      console.log(`\nCapturing Mobile Screens (${vp.name})...`);
      const mobileContext = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        isMobile: true,
        hasTouch: true,
        ignoreHTTPSErrors: true,
      });

      await mobileContext.addInitScript(
        ({ id, cred, name }) => {
          localStorage.setItem('aerokin_device_id', id);
          localStorage.setItem('aerokin_device_credential', cred);
          localStorage.setItem('aerokin_device_name', name);
        },
        { id: testDeviceId, cred: testRawCredential, name: 'Playwright iPhone' }
      );

      const page = await mobileContext.newPage();

      // 2A. Trackpad Tab (Default)
      await page.goto(`https://127.0.0.1:8443/?token=${token}`, {
        waitUntil: 'networkidle',
      });
      await sleep(800);
      await checkNoOverflow(page, `Trackpad Tab ${vp.name}`);
      const trackpadShot = path.join(SCREENSHOTS_DIR, `trackpad-${vp.name}.png`);
      await page.screenshot({ path: trackpadShot });
      console.log(`✓ Saved: ${trackpadShot}`);

      // 2B. Media Tab
      const mediaTabBtn = page.getByRole('tab', { name: /Media/i });
      if (await mediaTabBtn.isVisible()) {
        await mediaTabBtn.click();
        await sleep(600);
        await checkNoOverflow(page, `Media Tab ${vp.name}`);
        const mediaShot = path.join(SCREENSHOTS_DIR, `media-${vp.name}.png`);
        await page.screenshot({ path: mediaShot });
        console.log(`✓ Saved: ${mediaShot}`);
      }

      // 2C. Desktop Tab (Live Remote Viewer)
      const desktopTabBtn = page.getByRole('tab', { name: /Desktop/i });
      if (await desktopTabBtn.isVisible()) {
        await desktopTabBtn.click();
        await sleep(800);
        await checkNoOverflow(page, `Desktop Viewer ${vp.name}`);
        const desktopViewerShot = path.join(SCREENSHOTS_DIR, `desktop-viewer-${vp.name}.png`);
        await page.screenshot({ path: desktopViewerShot });
        console.log(`✓ Saved: ${desktopViewerShot}`);

        // Toggle Quick-Key Bar
        const keybarBtn = page.locator('button[aria-label="Toggle keyboard"]');
        if (await keybarBtn.isVisible()) {
          await keybarBtn.click();
          await sleep(400);
          await checkNoOverflow(page, `Desktop Keybar ${vp.name}`);
          const keybarShot = path.join(SCREENSHOTS_DIR, `desktop-keybar-${vp.name}.png`);
          await page.screenshot({ path: keybarShot });
          console.log(`✓ Saved: ${keybarShot}`);
        }

        // Return to normal navigation via Disconnect button
        const disconnectBtn = page.locator('button[aria-label="Disconnect"]');
        if (await disconnectBtn.isVisible()) {
          await disconnectBtn.click();
          await sleep(600);
        }
      }

      // 2D. Settings Sheet
      const settingsBtn = page.locator('button[aria-label="Settings"]');
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        await sleep(600);
        await checkNoOverflow(page, `Settings Sheet ${vp.name}`);
        const settingsShot = path.join(SCREENSHOTS_DIR, `settings-${vp.name}.png`);
        await page.screenshot({ path: settingsShot });
        console.log(`✓ Saved: ${settingsShot}`);
      }

      await mobileContext.close();
    }

    // =========================================================================
    // 3. LANDSCAPE MOBILE VIEWPORT (844x390 @ 3x) FOR DESKTOP VIEWER
    // =========================================================================
    console.log(`\nCapturing Landscape Desktop Viewer (844x390 @ 3x)...`);
    const landscapeContext = await browser.newContext({
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
    });

    await landscapeContext.addInitScript(
      ({ id, cred, name }) => {
        localStorage.setItem('aerokin_device_id', id);
        localStorage.setItem('aerokin_device_credential', cred);
        localStorage.setItem('aerokin_device_name', name);
      },
      { id: testDeviceId, cred: testRawCredential, name: 'Playwright iPhone' }
    );

    const landscapePage = await landscapeContext.newPage();
    await landscapePage.goto(`https://127.0.0.1:8443/?token=${token}`, {
      waitUntil: 'networkidle',
    });
    await sleep(800);

    const desktopTabBtnLs = landscapePage.getByRole('tab', { name: /Desktop/i });
    if (await desktopTabBtnLs.isVisible()) {
      await desktopTabBtnLs.click();
      await sleep(800);
      await checkNoOverflow(landscapePage, 'Desktop Viewer Landscape 844x390');
      const lsShot = path.join(SCREENSHOTS_DIR, 'desktop-viewer-landscape-844x390.png');
      await landscapePage.screenshot({ path: lsShot });
      console.log(`✓ Saved: ${lsShot}`);
    }
    await landscapeContext.close();

    console.log('\n======================================================');
    console.log('✓ ALL PLAYWRIGHT SCREENSHOTS & OVERFLOW CHECKS PASSED!');
    console.log('======================================================\n');
  } finally {
    await browser.close();
    serverProcess.kill('SIGINT');

    // Restore original devices.json
    if (originalDevicesContent !== null) {
      fs.writeFileSync(devicesFile, originalDevicesContent, 'utf8');
    }
  }
}

run().catch((err) => {
  console.error('[Error] Verification failed:', err);
  process.exit(1);
});
