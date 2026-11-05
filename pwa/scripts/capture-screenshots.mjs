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
    const page = await context.newPage();

    await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });

    // Open settings drawer
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

    await context.close();
  }

  await browser.close();
  console.log('Screenshots completed successfully!');
} finally {
  server.close();
}
