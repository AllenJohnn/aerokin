import http from 'node:http';

export interface TrustServerConfig {
  port: number;
  lanIp: string;
  httpsPort: number;
  caCertDer: Buffer;
  mobileconfig: string;
}

/**
 * Creates and starts a standalone HTTP server on port 8080
 * Dedicated solely to serving the Apple root profile, CA certificate, and trust instructions.
 */
export function startTrustServer(config: TrustServerConfig): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // 1. Apple .mobileconfig Profile Download for iOS
    if (pathname === '/aerokin-ca.mobileconfig') {
      res.writeHead(200, {
        'Content-Type': 'application/x-apple-aspen-config; charset=utf-8',
        'Content-Disposition': 'inline; filename="aerokin-ca.mobileconfig"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(config.mobileconfig);
      return;
    }

    // 2. Binary DER / PEM certificate for manual install or Android/Windows
    if (pathname === '/aerokin-ca.crt') {
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="aerokin-ca.crt"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(config.caCertDer);
      return;
    }

    // 3. Styled "Trust AEROKIN" Step-by-Step Webpage
    if (pathname === '/' || pathname === '/trust') {
      const httpsUrl = `https://${config.lanIp}:${config.httpsPort}`;
      const mdnsHttpsUrl = `https://aerokin.local:${config.httpsPort}`;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Trust AEROKIN Local CA (60s Setup)</title>
  <style>
    :root {
      --bg: #07070B;
      --surface: #0E0E17;
      --border: rgba(255, 255, 255, 0.08);
      --accent: #22D3EE;
      --text: #F5F5F7;
      --muted: #8A8A96;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 24px 16px 48px;
      line-height: 1.5;
      display: flex;
      justify-content: center;
    }
    .container {
      max-width: 480px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header {
      text-align: center;
      padding-bottom: 8px;
    }
    .badge {
      display: inline-block;
      font-family: monospace;
      font-size: 11px;
      letter-spacing: 0.1em;
      color: var(--accent);
      background: rgba(34, 211, 238, 0.1);
      border: 1px solid rgba(34, 211, 238, 0.3);
      padding: 4px 10px;
      border-radius: 9999px;
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    h1 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #FFF;
    }
    .subtitle {
      font-size: 13px;
      color: var(--muted);
      margin-top: 6px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .step {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    .step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(34, 211, 238, 0.15);
      color: var(--accent);
      font-weight: bold;
      font-family: monospace;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .step-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .step-title {
      font-size: 14px;
      font-weight: 700;
      color: #FFF;
    }
    .step-desc {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.45;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: linear-gradient(135deg, #7C5CFF 0%, #22D3EE 100%);
      color: #FFF;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      padding: 14px 20px;
      border-radius: 14px;
      margin-top: 6px;
      box-shadow: 0 4px 20px rgba(34, 211, 238, 0.3);
      text-align: center;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: var(--text);
      box-shadow: none;
      font-size: 13px;
      padding: 10px 16px;
    }
    .note {
      font-size: 11px;
      color: var(--muted);
      text-align: center;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">One-Time Setup · 60s</div>
      <h1>Trust AEROKIN Local CA</h1>
      <p class="subtitle">Enable zero-warning, 100% encrypted HTTPS between your iPhone and PC.</p>
    </div>

    <div class="card">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-content">
          <div class="step-title">Download Profile</div>
          <div class="step-desc">Tap below and choose <strong>"Allow"</strong> when iOS asks to download the configuration profile.</div>
          <a href="/aerokin-ca.mobileconfig" class="btn">
            📥 Install iOS Profile
          </a>
        </div>
      </div>

      <div class="step">
        <div class="step-num">2</div>
        <div class="step-content">
          <div class="step-title">Install in Settings</div>
          <div class="step-desc">Open iPhone <strong>Settings</strong> &rarr; tap <strong>Profile Downloaded</strong> (near top) &rarr; tap <strong>Install</strong>.</div>
        </div>
      </div>

      <div class="step">
        <div class="step-num">3</div>
        <div class="step-content">
          <div class="step-title">Enable Full Trust</div>
          <div class="step-desc">In Settings, go to <strong>General &rarr; About &rarr; Certificate Trust Settings</strong>.<br>Toggle on <strong>AEROKIN Local CA</strong>.</div>
        </div>
      </div>
    </div>

    <div class="card" style="text-align: center;">
      <div class="step-title" style="margin-bottom: 4px;">Ready to Connect?</div>
      <p class="step-desc" style="margin-bottom: 12px;">After completing the steps above, tap below to launch AEROKIN with trusted HTTPS:</p>
      <a href="${httpsUrl}" class="btn">
        🚀 Launch AEROKIN (${config.lanIp})
      </a>
      <a href="${mdnsHttpsUrl}" class="btn btn-secondary" style="margin-top: 8px;">
        Or try: aerokin.local:8443
      </a>
    </div>

    <p class="note">The Local CA is generated directly on your laptop. The private key never leaves your machine.</p>
  </div>
</body>
</html>`;

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(html);
      return;
    }

    // 4. Redirect all other HTTP traffic on port 8080 to HTTPS
    const targetHttps = `https://${config.lanIp}:${config.httpsPort}${pathname}${url.search}`;
    res.writeHead(302, { Location: targetHttps });
    res.end();
  });

  server.listen(config.port, '0.0.0.0', () => {
    console.log(
      `[Trust Server] HTTP listening on port ${config.port} (Serving one-time CA trust profile)`
    );
  });

  return server;
}
