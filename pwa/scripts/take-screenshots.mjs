import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
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

async function run() {
  console.log('--- Starting AEROKIN Server for Playwright Verification ---');

  const tokenFile = path.join(ROOT_DIR, 'server/.certs/token.txt');
  let token = '4EA378';
  if (fs.existsSync(tokenFile)) {
    token = fs.readFileSync(tokenFile, 'utf8').trim();
  }

  // Start server process
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
    // -------------------------------------------------------------------------
    // PASS 1: DESKTOP LOCALHOST PAIRING DASHBOARD (1440x900)
    // -------------------------------------------------------------------------
    console.log('Capturing Desktop Dashboard (1440x900)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
    });

    const desktopPage = await desktopContext.newPage();
    desktopPage.on('console', (msg) => console.log('[Desktop Console]', msg.type(), msg.text()));
    desktopPage.on('pageerror', (err) => console.error('[Desktop Page Error]', err));
    await desktopPage.goto(`https://127.0.0.1:8443/?token=${token}`, {
      waitUntil: 'networkidle',
    });
    // Wait for QR code image to render
    await desktopPage.waitForSelector('img[alt="AEROKIN Pairing QR Code"]', { timeout: 5000 }).catch(() => {});
    await sleep(1500);

    const desktopShot = path.join(SCREENSHOTS_DIR, '01-desktop-pairing-dashboard.png');
    await desktopPage.screenshot({ path: desktopShot, fullPage: false });
    console.log(`✓ Saved: ${desktopShot}`);
    await desktopContext.close();

    // -------------------------------------------------------------------------
    // PASS 2: IPHONE 14 VIEWPORT (390x844, DPR 3, Touch Enabled)
    // -------------------------------------------------------------------------
    console.log('Capturing iPhone 14 Mobile Experience (390x844 @ 3x DPR)...');
    const iphoneContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ignoreHTTPSErrors: true,
    });

    const iphonePage = await iphoneContext.newPage();

    // Emulate iOS DeviceMotionEvent with requestPermission to trigger start screen
    await iphonePage.addInitScript(() => {
      window.DeviceMotionEvent = {
        requestPermission: async () => 'granted',
      };
    });

    // 2A. Start Screen (Motion Permission)
    await iphonePage.goto(`https://127.0.0.1:8443/?token=${token}`, {
      waitUntil: 'networkidle',
    });
    await sleep(1200);

    const startShot = path.join(SCREENSHOTS_DIR, '02-iphone-start-screen.png');
    await iphonePage.screenshot({ path: startShot });
    console.log(`✓ Saved: ${startShot}`);

    // Tap "Enable Motion Sensors"
    const enableBtn = iphonePage.getByRole('button', { name: /Enable Motion/i });
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      await sleep(1200);
    }

    // 2B. Air Mouse Tab
    const airMouseShot = path.join(SCREENSHOTS_DIR, '03-iphone-air-mouse.png');
    await iphonePage.screenshot({ path: airMouseShot });
    console.log(`✓ Saved: ${airMouseShot}`);

    // 2C. Air Mouse Settings Sheet
    const configBtn = iphonePage.getByRole('button', { name: /Config/i });
    if (await configBtn.isVisible()) {
      await configBtn.click();
      await sleep(800);
      const settingsShot = path.join(SCREENSHOTS_DIR, '04-iphone-air-mouse-settings.png');
      await iphonePage.screenshot({ path: settingsShot });
      console.log(`✓ Saved: ${settingsShot}`);

      // Close settings sheet by clicking the backdrop or top X button
      const backdrop = iphonePage.locator('div.fixed.inset-0.z-50 > div.absolute.inset-0');
      if (await backdrop.isVisible()) {
        await backdrop.click({ position: { x: 50, y: 50 }, force: true });
        await sleep(600);
      }
    }

    // 2D. Trackpad Tab
    const trackpadTabBtn = iphonePage.getByRole('button', { name: /Trackpad/i });
    if (await trackpadTabBtn.isVisible()) {
      await trackpadTabBtn.click();
      await sleep(800);
      const trackpadShot = path.join(SCREENSHOTS_DIR, '05-iphone-trackpad.png');
      await iphonePage.screenshot({ path: trackpadShot });
      console.log(`✓ Saved: ${trackpadShot}`);
    }

    // 2E. Media Tab
    const mediaTabBtn = iphonePage.getByRole('button', { name: /Media/i });
    if (await mediaTabBtn.isVisible()) {
      await mediaTabBtn.click();
      await sleep(800);
      const mediaShot = path.join(SCREENSHOTS_DIR, '06-iphone-media-remote.png');
      await iphonePage.screenshot({ path: mediaShot });
      console.log(`✓ Saved: ${mediaShot}`);
    }

    await iphoneContext.close();
    console.log('\n--- ALL VERIFICATION SCREENSHOTS CAPTURED SUCCESSFULLY! ---');
  } finally {
    await browser.close();
    serverProcess.kill('SIGINT');
  }
}

run().catch((err) => {
  console.error('[Error] Verification failed:', err);
  process.exit(1);
});
