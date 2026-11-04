import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.resolve(__dirname, '../public');
const DS_PUBLIC = path.resolve(__dirname, '../../design-system/public');

// Master vector source
const SVG_SOURCE = fs.existsSync(path.join(PUBLIC_DIR, 'logo-mark.svg'))
  ? path.join(PUBLIC_DIR, 'logo-mark.svg')
  : path.join(DS_PUBLIC, 'logo-mark.svg');

function createIcoFromPngs(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  for (const { width, height, buffer } of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    dirEntries.push(entry);
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map((p) => p.buffer)]);
}

async function generateIcons() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  if (!fs.existsSync(SVG_SOURCE)) {
    console.error(`[Error] Logo SVG not found at ${SVG_SOURCE}`);
    process.exit(1);
  }

  const svgContent = fs.readFileSync(SVG_SOURCE, 'utf8');

  // 1. Apple Touch Icon: 180x180, OPAQUE #000000 background, 24px padding (132x132 logo)
  const logoInner132 = await sharp(Buffer.from(svgContent)).resize(132, 132).toBuffer();
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: '#000000',
    },
  })
    .composite([{ input: logoInner132, top: 24, left: 24 }])
    .png()
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('✓ apple-touch-icon.png (180x180, opaque #000)');

  // 2. icon-192.png
  await sharp(Buffer.from(svgContent)).resize(192, 192).png().toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
  console.log('✓ icon-192.png (192x192)');

  // 3. icon-512.png
  await sharp(Buffer.from(svgContent)).resize(512, 512).png().toFile(path.join(PUBLIC_DIR, 'icon-512.png'));
  console.log('✓ icon-512.png (512x512)');

  // 4. icon-512-maskable.png (400x400 safe zone on 512x512 #000000 background)
  const logo400 = await sharp(Buffer.from(svgContent)).resize(400, 400).toBuffer();
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: '#000000',
    },
  })
    .composite([{ input: logo400, top: 56, left: 56 }])
    .png()
    .toFile(path.join(PUBLIC_DIR, 'icon-512-maskable.png'));
  console.log('✓ icon-512-maskable.png (512x512, maskable safe zone #000)');

  // 5. favicon.ico (16, 32, 48)
  const favSource = fs.existsSync(path.join(PUBLIC_DIR, 'favicon.svg'))
    ? fs.readFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), 'utf8')
    : svgContent;

  const png16 = await sharp(Buffer.from(favSource)).resize(16, 16).png().toBuffer();
  const png32 = await sharp(Buffer.from(favSource)).resize(32, 32).png().toBuffer();
  const png48 = await sharp(Buffer.from(favSource)).resize(48, 48).png().toBuffer();

  const icoBuffer = createIcoFromPngs([
    { width: 16, height: 16, buffer: png16 },
    { width: 32, height: 32, buffer: png32 },
    { width: 48, height: 48, buffer: png48 },
  ]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuffer);
  console.log('✓ favicon.ico (16/32/48 multi-resolution)');

  // 6. og-image.png (1200x630 from og-image.svg)
  const ogSvgPath = path.join(PUBLIC_DIR, 'og-image.svg');
  if (fs.existsSync(ogSvgPath)) {
    const ogSvg = fs.readFileSync(ogSvgPath);
    await sharp(ogSvg).resize(1200, 630).png().toFile(path.join(PUBLIC_DIR, 'og-image.png'));
    console.log('✓ og-image.png (1200x630, plain black #000)');
  }
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
