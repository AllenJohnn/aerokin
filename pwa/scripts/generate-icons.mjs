import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_SOURCE = path.resolve(__dirname, '../../design-system/public/logo-lg.svg');
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const SIZES = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
];

async function generateIcons() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  if (!fs.existsSync(SVG_SOURCE)) {
    console.error(`[Error] Logo SVG not found at ${SVG_SOURCE}`);
    process.exit(1);
  }

  const svgContent = fs.readFileSync(SVG_SOURCE, 'utf8');

  // Wrap SVG in a dark background card so icons look crisp on home screens
  const bgSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <rect width="120" height="120" rx="26" fill="#07070B" />
      <g transform="translate(10, 10)">
        ${svgContent.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}
      </g>
    </svg>
  `;

  for (const { size, name } of SIZES) {
    const outPath = path.join(PUBLIC_DIR, name);
    await sharp(Buffer.from(bgSvg), { density: 300 })
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`Generated ${name} (${size}x${size})`);
  }
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
