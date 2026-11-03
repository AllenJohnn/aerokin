import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.resolve(__dirname, '../public/brand-exploration');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// 4 Distinctive Vector Concepts (100x100 viewBox)
const concepts = {
  // Concept 1: The Kinetic Arrowhead A - Arrow pointer fused with aerodynamic A & negative space slice
  concept1: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
      <!-- Left aerodynamic foil leg -->
      <path d="M 18 84 L 46 14 C 47.5 11 52.5 11 54 14 L 62 30 L 38 78 L 18 84 Z" fill="white" />
      <!-- Right cursor blade & crossbar -->
      <path d="M 50 14 L 82 84 L 64 84 L 56 66 L 34 66 L 42 50 L 62 50 L 50 26 Z" fill="white" />
      <!-- Speed slash accent / beacon -->
      <polygon points="56,50 86,50 78,66 48,66" fill="white" />
    </svg>
  `,

  // Concept 2: The Kinetic Pointer (Geometric A fused directly with OS cursor arrowhead)
  concept2: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
      <!-- Main A body with cursor angle -->
      <path d="M 50 10 L 84 84 L 64 84 L 52 56 L 36 56 L 24 84 L 14 84 L 46 10 C 47.5 7 50.5 7 50 10 Z" fill="white" />
      <!-- Sharp cursor arrowhead cutting through the crossbar into negative space -->
      <polygon points="32,56 76,56 68,44 40,44" fill="white" />
      <!-- Apex cursor notch -->
      <polygon points="46,32 54,32 50,20" fill="#07070B" />
    </svg>
  `,

  // Concept 3: The Stealth Arrow (Pure geometric glyph: crisp cursor chevron forming apex + negative space air crossbar)
  concept3: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
      <!-- Left leg -->
      <polygon points="20,84 46,14 56,14 36,84" fill="white" />
      <!-- Right leg terminating in an acute cursor tip -->
      <polygon points="44,14 54,14 80,84 64,84" fill="white" />
      <!-- Kinetic crossbar: a dynamic arrow-trail shooting from left to right -->
      <polygon points="12,56 74,56 86,46 32,46" fill="white" />
      <!-- Glowing pointer beacon dot at crossbar tip -->
      <circle cx="86" cy="46" r="4.5" fill="white" />
    </svg>
  `,

  // Concept 4: The Apex Airfoil (Precision cursor arrow that forms the uppercase A via negative space inner tunnel)
  concept4: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
      <!-- Solid bold aerodynamic A silhouette with internal negative space chevron -->
      <path d="M 50 10 L 86 84 L 65 84 L 54 60 L 46 60 L 35 84 L 14 84 Z M 50 32 L 39 52 L 61 52 Z" fill="white" fill-rule="evenodd" />
      <!-- Negative space kinetic vector slices cutting through left and right wings -->
      <line x1="10" y1="58" x2="90" y2="58" stroke="#07070B" stroke-width="5" stroke-linecap="round" />
      <polygon points="68,52 90,58 68,64" fill="white" />
    </svg>
  `,
};

const SIZES = [16, 32, 64, 512];

async function run() {
  console.log('Generating brand concepts at 16, 32, 64, 512px...');

  for (const [id, svg] of Object.entries(concepts)) {
    // Save raw SVG
    fs.writeFileSync(path.join(OUT_DIR, `${id}.svg`), svg.trim(), 'utf8');

    for (const size of SIZES) {
      // Dark background test
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .flatten({ background: '#07070B' })
        .png()
        .toFile(path.join(OUT_DIR, `${id}-${size}px-dark.png`));

      // Light/mono background test to ensure it works anywhere
      const invertedSvg = svg.replace(/fill="white"/g, 'fill="black"').replace(/stroke="#07070B"/g, 'stroke="white"');
      await sharp(Buffer.from(invertedSvg))
        .resize(size, size)
        .flatten({ background: '#FFFFFF' })
        .png()
        .toFile(path.join(OUT_DIR, `${id}-${size}px-light.png`));
    }
  }

  console.log('Done! Rendered all concepts into public/brand-exploration/');
}

run();
