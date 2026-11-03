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
    // 1. DESKTOP LOCALHOST PAIRING DASHBOARD (1440x900)
    // -------------------------------------------------------------------------
    console.log('Capturing Desktop Dashboard (1440x900)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
    });

    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(`https://127.0.0.1:8443/?token=${token}`, {
      waitUntil: 'networkidle',
    });
    await sleep(1500);

    const desktopShot = path.join(SCREENSHOTS_DIR, '01-desktop-pairing-dashboard.png');
    await desktopPage.screenshot({ path: desktopShot, fullPage: false });
    console.log(`✓ Saved: ${desktopShot}`);
    await desktopContext.close();

    // -------------------------------------------------------------------------
    // 2. IPHONE MOBILE EXPERIENCE (390x844, DPR 3, Touch Enabled)
    // -------------------------------------------------------------------------
    console.log('Capturing iPhone Mobile Experience (390x844 @ 3x DPR)...');
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
    await sleep(1000);

    const startShot = path.join(SCREENSHOTS_DIR, '02-iphone-start-screen.png');
    await iphonePage.screenshot({ path: startShot });
    console.log(`✓ Saved: ${startShot}`);

    // Tap "Initialize Remote Sensors"
    const enableBtn = iphonePage.getByRole('button', { name: /Initialize Remote|Enable Motion/i });
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      await sleep(1000);
    }

    // 2B. Air Pointer Tab (Decepticon Theme)
    const airPointerShot = path.join(SCREENSHOTS_DIR, '03-iphone-air-pointer-decepticon.png');
    await iphonePage.screenshot({ path: airPointerShot });
    console.log(`✓ Saved: ${airPointerShot}`);

    // 2C. Open Settings Drawer
    const settingsBtn = iphonePage.getByRole('button', { name: /Settings/i });
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await sleep(800);
      const settingsShot = path.join(SCREENSHOTS_DIR, '04-iphone-settings-drawer.png');
      await iphonePage.screenshot({ path: settingsShot });
      console.log(`✓ Saved: ${settingsShot}`);

      // Open Calibration Wizard from Settings
      const calBtn = iphonePage.getByRole('button', { name: /Calibrate/i });
      if (await calBtn.isVisible()) {
        await calBtn.click();
        await sleep(800);
        const calShot = path.join(SCREENSHOTS_DIR, '05-iphone-calibration-wizard.png');
        await iphonePage.screenshot({ path: calShot });
        console.log(`✓ Saved: ${calShot}`);

        // Close calibration modal
        const closeCalBtn = iphonePage.getByRole('button', { name: /Close/i });
        if (await closeCalBtn.isVisible()) {
          await closeCalBtn.click();
          await sleep(500);
        }
      }

      // Re-open settings to switch to AERO theme
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        await sleep(600);
        const aeroBtn = iphonePage.getByRole('button', { name: /AERO/i });
        if (await aeroBtn.isVisible()) {
          await aeroBtn.click();
          await sleep(600);
          const aeroShot = path.join(SCREENSHOTS_DIR, '08-iphone-aero-preset.png');
          await iphonePage.screenshot({ path: aeroShot });
          console.log(`✓ Saved: ${aeroShot}`);

          // Switch back to DECEPTICON
          const decepticonBtn = iphonePage.getByRole('button', { name: /DECEPTICON/i });
          if (await decepticonBtn.isVisible()) {
            await decepticonBtn.click();
            await sleep(400);
          }
        }

        // Close drawer
        const closeDrawerBtn = iphonePage.getByRole('button', { name: /Close/i });
        if (await closeDrawerBtn.isVisible()) {
          await closeDrawerBtn.click();
          await sleep(500);
        }
      }
    }

    // 2D. Trackpad Tab
    const trackpadTabBtn = iphonePage.getByRole('button', { name: /Trackpad/i });
    if (await trackpadTabBtn.isVisible()) {
      await trackpadTabBtn.click();
      await sleep(800);
      const trackpadShot = path.join(SCREENSHOTS_DIR, '06-iphone-trackpad.png');
      await iphonePage.screenshot({ path: trackpadShot });
      console.log(`✓ Saved: ${trackpadShot}`);
    }

    // 2E. Media Tab
    const mediaTabBtn = iphonePage.getByRole('button', { name: /Media/i });
    if (await mediaTabBtn.isVisible()) {
      await mediaTabBtn.click();
      await sleep(800);
      const mediaShot = path.join(SCREENSHOTS_DIR, '07-iphone-media-remote.png');
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
