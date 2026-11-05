import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DS_PUBLIC = path.resolve(__dirname, '../public');
const PWA_PUBLIC = path.resolve(__dirname, '../../pwa/public');

// Ensure output dirs exist
for (const dir of [DS_PUBLIC, PWA_PUBLIC]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. MASTER LOGO MARK SVG (100x100 viewBox)
// Fuses angular delta "A" with supersonic kinetic crossbar & cursor arrowhead
// ---------------------------------------------------------------------------
const masterLogoMarkSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <defs>
    <linearGradient id="akGrad" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#7C5CFF" />
      <stop offset="100%" stop-color="#22D3EE" />
    </linearGradient>
    <linearGradient id="akTipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22D3EE" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
    <filter id="akGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Aerokin Delta A: Left Wing, Apex, Right Wing -->
  <polygon points="50,12 16,86 32,86 45,56 50,44" fill="url(#akGrad)" />
  <polygon points="50,12 55,44 60,56 84,86 68,86" fill="url(#akGrad)" />

  <!-- Kinetic Slipstream Crossbar -->
  <!-- Left speed trail pulse -->
  <polygon points="8,54 22,54 26,44 12,44" fill="url(#akGrad)" opacity="0.65" />
  
  <!-- Supersonic Crossbar Lance terminating in Cursor Arrowhead -->
  <polygon points="28,54 78,54 92,44 75,44 78,48 34,48" fill="url(#akGrad)" />

  <!-- Cursor Beacon Dot at Arrow Apex -->
  <circle cx="92" cy="44" r="3.5" fill="url(#akTipGrad)" filter="url(#akGlow)" />
</svg>
`.trim();

// ---------------------------------------------------------------------------
// 2. MONO LOGO MARK SVG (Pure white for dark surfaces / black for light)
// ---------------------------------------------------------------------------
const monoLogoMarkSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <!-- Aerokin Delta A -->
  <polygon points="50,12 16,86 32,86 45,56 50,44" fill="#F5F5F7" />
  <polygon points="50,12 55,44 60,56 84,86 68,86" fill="#F5F5F7" />

  <!-- Kinetic Slipstream Crossbar -->
  <polygon points="8,54 22,54 26,44 12,44" fill="#F5F5F7" opacity="0.5" />
  <polygon points="28,54 78,54 92,44 75,44 78,48 34,48" fill="#F5F5F7" />

  <!-- Cursor Beacon Dot -->
  <circle cx="92" cy="44" r="3.5" fill="#F5F5F7" />
</svg>
`.trim();

// ---------------------------------------------------------------------------
// 3. FAVICON SVG (Optimized for tiny 16-32px tabs with prefers-color-scheme)
// High-contrast, boldened strokes, crisp at 16x16
// ---------------------------------------------------------------------------
const faviconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <style>
    :root {
      --ak-color: #22D3EE;
      --ak-beacon: #38BDF8;
      --ak-trail: #7C5CFF;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --ak-color: #0F172A;
        --ak-beacon: #2563EB;
        --ak-trail: #4F46E5;
      }
    }
  </style>
  <defs>
    <linearGradient id="favGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="var(--ak-trail)" />
      <stop offset="100%" stop-color="var(--ak-color)" />
    </linearGradient>
  </defs>

  <!-- Heavyweight Delta A for extreme legibility at 16px -->
  <polygon points="50,10 12,88 34,88 46,58 50,46" fill="url(#favGrad)" />
  <polygon points="50,10 54,46 58,58 88,88 66,88" fill="url(#favGrad)" />

  <!-- Kinetic crossbar and cursor tip -->
  <polygon points="6,56 22,56 26,44 10,44" fill="url(#favGrad)" opacity="0.7" />
  <polygon points="26,56 78,56 94,44 74,44 78,48 32,48" fill="url(#favGrad)" />
  <circle cx="94" cy="44" r="5" fill="var(--ak-beacon)" />
</svg>
`.trim();

// ---------------------------------------------------------------------------
// 4. HORIZONTAL WORDMARK SVG (320x64 viewBox)
// Mark on left + custom tracked AEROKIN typography + precision sub-label
// ---------------------------------------------------------------------------
const wordmarkSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 64" fill="none">
  <defs>
    <linearGradient id="wmGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7C5CFF" />
      <stop offset="100%" stop-color="#22D3EE" />
    </linearGradient>
    <linearGradient id="wmTextGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#E2E8F0" />
    </linearGradient>
  </defs>

  <!-- Logo Mark (Scaled & Offset to x=4, y=6, 52x52) -->
  <g transform="translate(6, 6) scale(0.52)">
    <polygon points="50,12 16,86 32,86 45,56 50,44" fill="url(#wmGrad)" />
    <polygon points="50,12 55,44 60,56 84,86 68,86" fill="url(#wmGrad)" />
    <polygon points="8,54 22,54 26,44 12,44" fill="url(#wmGrad)" opacity="0.65" />
    <polygon points="28,54 78,54 92,44 75,44 78,48 34,48" fill="url(#wmGrad)" />
    <circle cx="92" cy="44" r="3.5" fill="#22D3EE" />
  </g>

  <!-- Custom Geometric Lettering "A E R O K I N" -->
  <text x="70" y="40" 
        font-family="'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        font-size="28" 
        font-weight="800" 
        letter-spacing="0.18em" 
        fill="url(#wmTextGrad)">AEROKIN</text>

  <!-- Tagline / Subtitle in Geist Mono -->
  <text x="71" y="54" 
        font-family="'Geist Mono', 'SF Mono', monospace" 
        font-size="8.5" 
        font-weight="500" 
        letter-spacing="0.28em" 
        fill="#8A8A96">AIR MOUSE &amp; PC REMOTE</text>
</svg>
`.trim();

// ---------------------------------------------------------------------------
// 5. OG IMAGE SVG (1200x630)
// High-production social share banner
// ---------------------------------------------------------------------------
const ogImageSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#07070B" />
      <stop offset="50%" stop-color="#0C0C14" />
      <stop offset="100%" stop-color="#07070B" />
    </linearGradient>

    <!-- Mesh radial glows -->
    <radialGradient id="meshViolet" cx="15%" cy="20%" r="55%">
      <stop offset="0%" stop-color="#7C5CFF" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#7C5CFF" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="meshCyan" cx="85%" cy="80%" r="55%">
      <stop offset="0%" stop-color="#22D3EE" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#22D3EE" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="meshCenter" cx="45%" cy="50%" r="40%">
      <stop offset="0%" stop-color="#6366F1" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#6366F1" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="markGrad" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#7C5CFF" />
      <stop offset="100%" stop-color="#22D3EE" />
    </linearGradient>

    <filter id="heavyGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="24" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Deep Dark Base -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />

  <!-- Aurora Mesh Ambient Layers -->
  <rect width="1200" height="630" fill="url(#meshViolet)" />
  <rect width="1200" height="630" fill="url(#meshCyan)" />
  <rect width="1200" height="630" fill="url(#meshCenter)" />

  <!-- Subtle Precision Grid Pattern -->
  <g opacity="0.08" stroke="#FFFFFF" stroke-width="1">
    <line x1="0" y1="105" x2="1200" y2="105" />
    <line x1="0" y1="210" x2="1200" y2="210" />
    <line x1="0" y1="315" x2="1200" y2="315" />
    <line x1="0" y1="420" x2="1200" y2="420" />
    <line x1="0" y1="525" x2="1200" y2="525" />

    <line x1="200" y1="0" x2="200" y2="630" />
    <line x1="400" y1="0" x2="400" y2="630" />
    <line x1="600" y1="0" x2="600" y2="630" />
    <line x1="800" y1="0" x2="800" y2="630" />
    <line x1="1000" y1="0" x2="1000" y2="630" />
  </g>

  <!-- Master Brand Mark Left Hero -->
  <g transform="translate(100, 165) scale(3.0)" filter="url(#heavyGlow)">
    <polygon points="50,12 16,86 32,86 45,56 50,44" fill="url(#markGrad)" />
    <polygon points="50,12 55,44 60,56 84,86 68,86" fill="url(#markGrad)" />
    <polygon points="8,54 22,54 26,44 12,44" fill="url(#markGrad)" opacity="0.65" />
    <polygon points="28,54 78,54 92,44 75,44 78,48 34,48" fill="url(#markGrad)" />
    <circle cx="92" cy="44" r="3.5" fill="#22D3EE" />
  </g>

  <!-- Brand Typography Right Side -->
  <g transform="translate(480, 210)">
    <!-- Pill Status Badge -->
    <rect x="0" y="0" width="220" height="32" rx="16" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
    <circle cx="16" cy="16" r="4" fill="#22D3EE" />
    <text x="30" y="20.5" font-family="'Geist Mono', monospace" font-size="11" font-weight="600" letter-spacing="0.16em" fill="#22D3EE">WINDOWS + IPHONE</text>

    <!-- Main Title -->
    <text x="0" y="90" font-family="'Geist', -apple-system, sans-serif" font-size="76" font-weight="800" letter-spacing="0.08em" fill="#F5F5F7">AEROKIN</text>

    <!-- Tagline -->
    <text x="0" y="145" font-family="'Geist', -apple-system, sans-serif" font-size="32" font-weight="400" fill="#F5F5F7">Move the air. <tspan fill="#22D3EE">Move your PC.</tspan></text>

    <!-- Sub-description -->
    <text x="0" y="185" font-family="'Geist', -apple-system, sans-serif" font-size="18" fill="#8A8A96">Live Desktop Remote · Precision Trackpad · Low-Latency Media Remote</text>

    <!-- Feature Pillars -->
    <g transform="translate(0, 220)">
      <rect x="0" y="0" width="165" height="36" rx="8" fill="rgba(124, 92, 255, 0.12)" stroke="rgba(124, 92, 255, 0.3)" />
      <text x="82.5" y="22" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="12" font-weight="500" fill="#F5F5F7">Precision Trackpad</text>

      <rect x="180" y="0" width="165" height="36" rx="8" fill="rgba(34, 211, 238, 0.12)" stroke="rgba(34, 211, 238, 0.3)" />
      <text x="262.5" y="22" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="12" font-weight="500" fill="#F5F5F7">Zero Install PWA</text>

      <rect x="360" y="0" width="165" height="36" rx="8" fill="rgba(255, 255, 255, 0.08)" stroke="rgba(255, 255, 255, 0.15)" />
      <text x="442.5" y="22" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="12" font-weight="500" fill="#F5F5F7">&lt; 15ms Latency</text>
    </g>
  </g>
</svg>
`.trim();

// ---------------------------------------------------------------------------
// Helper: Build standard Windows multi-resolution ICO file (16, 32, 48)
// Valid modern ICO consists of ICO header + directory entries + PNG buffers
// ---------------------------------------------------------------------------
function createIcoFromPngs(pngBuffers) {
  // pngBuffers: array of { width, height, buffer }
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved 0
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  const dirEntries = [];
  for (const { width, height, buffer } of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // Size of image data
    entry.writeUInt32LE(offset, 12); // Offset of image data
    offset += buffer.length;
    dirEntries.push(entry);
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map(p => p.buffer)]);
}

async function main() {
  console.log('Generating full suite of production brand assets...');

  // 1. Write SVG vectors to both design-system and pwa
  const svgs = [
    { name: 'logo-mark.svg', content: masterLogoMarkSvg },
    { name: 'logo-mono.svg', content: monoLogoMarkSvg },
    { name: 'favicon.svg', content: faviconSvg },
    { name: 'wordmark.svg', content: wordmarkSvg },
    { name: 'og-image.svg', content: ogImageSvg },
  ];

  for (const { name, content } of svgs) {
    fs.writeFileSync(path.join(DS_PUBLIC, name), content, 'utf8');
    fs.writeFileSync(path.join(PWA_PUBLIC, name), content, 'utf8');
  }

  // 2. Generate PNG Renders
  // A. apple-touch-icon.png (180x180, OPAQUE #07070B background, 24px padding = 132x132 logo)
  const logoInner132 = await sharp(Buffer.from(masterLogoMarkSvg))
    .resize(132, 132)
    .toBuffer();

  const appleTouchIcon = await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: '#07070B'
    }
  })
    .composite([{ input: logoInner132, top: 24, left: 24 }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(DS_PUBLIC, 'apple-touch-icon.png'), appleTouchIcon);
  fs.writeFileSync(path.join(PWA_PUBLIC, 'apple-touch-icon.png'), appleTouchIcon);

  // B. icon-192.png (192x192)
  const icon192 = await sharp(Buffer.from(masterLogoMarkSvg))
    .resize(192, 192)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(DS_PUBLIC, 'icon-192.png'), icon192);
  fs.writeFileSync(path.join(PWA_PUBLIC, 'icon-192.png'), icon192);

  // C. icon-512.png (512x512)
  const icon512 = await sharp(Buffer.from(masterLogoMarkSvg))
    .resize(512, 512)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(DS_PUBLIC, 'icon-512.png'), icon512);
  fs.writeFileSync(path.join(PWA_PUBLIC, 'icon-512.png'), icon512);

  // D. icon-512-maskable.png (512x512, full-bleed #07070B background, logo inside 80% safe zone = 400x400)
  const logo400 = await sharp(Buffer.from(masterLogoMarkSvg))
    .resize(400, 400)
    .toBuffer();

  const maskable512 = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: '#07070B'
    }
  })
    .composite([{ input: logo400, top: 56, left: 56 }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(DS_PUBLIC, 'icon-512-maskable.png'), maskable512);
  fs.writeFileSync(path.join(PWA_PUBLIC, 'icon-512-maskable.png'), maskable512);

  // E. og-image.png (1200x630)
  const ogImagePng = await sharp(Buffer.from(ogImageSvg))
    .resize(1200, 630)
    .png({ quality: 95 })
    .toBuffer();
  fs.writeFileSync(path.join(DS_PUBLIC, 'og-image.png'), ogImagePng);
  fs.writeFileSync(path.join(PWA_PUBLIC, 'og-image.png'), ogImagePng);

  // F. favicon.ico (16, 32, 48)
  const png16 = await sharp(Buffer.from(faviconSvg)).resize(16, 16).png().toBuffer();
  const png32 = await sharp(Buffer.from(faviconSvg)).resize(32, 32).png().toBuffer();
  const png48 = await sharp(Buffer.from(faviconSvg)).resize(48, 48).png().toBuffer();

  const icoBuffer = createIcoFromPngs([
    { width: 16, height: 16, buffer: png16 },
    { width: 32, height: 32, buffer: png32 },
    { width: 48, height: 48, buffer: png48 },
  ]);

  fs.writeFileSync(path.join(DS_PUBLIC, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(PWA_PUBLIC, 'favicon.ico'), icoBuffer);

  // Keep legacy logo-sm.svg, logo-md.svg, logo-lg.svg pointing to refined master mark for total compatibility
  fs.writeFileSync(path.join(DS_PUBLIC, 'logo-sm.svg'), masterLogoMarkSvg);
  fs.writeFileSync(path.join(DS_PUBLIC, 'logo-md.svg'), masterLogoMarkSvg);
  fs.writeFileSync(path.join(DS_PUBLIC, 'logo-lg.svg'), masterLogoMarkSvg);

  console.log('SUCCESS: All brand assets delivered to design-system/public and pwa/public!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
