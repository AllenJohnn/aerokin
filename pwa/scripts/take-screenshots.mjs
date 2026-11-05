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

  const tokenFile = path.join(ROOT_DIR, 'server/.certs/token.txt');
  let token = '4EA378';
  if (fs.existsSync(tokenFile)) {
    token = fs.readFileSync(tokenFile, 'utf8').trim();
  }

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

      const page = await mobileContext.newPage();

      // 2A. Trackpad Tab (Default)
      await page.goto(`https://127.0.0.1:8443/?token=${token}`, {
        waitUntil: 'networkidle',
      });
      await sleep(600);
      await checkNoOverflow(page, `Trackpad Tab ${vp.name}`);
      const trackpadShot = path.join(SCREENSHOTS_DIR, `trackpad-${vp.name}.png`);
      await page.screenshot({ path: trackpadShot });
      console.log(`✓ Saved: ${trackpadShot}`);

      // 2D. Media Tab
      const mediaTabBtn = page.getByRole('tab', { name: /Media/i });
      if (await mediaTabBtn.isVisible()) {
        await mediaTabBtn.click();
        await sleep(600);
        await checkNoOverflow(page, `Media Tab ${vp.name}`);
        const mediaShot = path.join(SCREENSHOTS_DIR, `media-${vp.name}.png`);
        await page.screenshot({ path: mediaShot });
        console.log(`✓ Saved: ${mediaShot}`);
      }

      // 2E. Settings Sheet (open sheet last so it doesn't block tab navigation)
      const settingsBtn = page.getByRole('button', { name: /Settings/i });
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

    console.log('\n======================================================');
    console.log('✓ ALL PLAYWRIGHT SCREENSHOTS & OVERFLOW CHECKS PASSED!');
    console.log('======================================================\n');
  } finally {
    await browser.close();
    serverProcess.kill('SIGINT');
  }
}

run().catch((err) => {
  console.error('[Error] Verification failed:', err);
  process.exit(1);
});
