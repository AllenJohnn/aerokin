import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.resolve(__dirname, '../public/brand-refinement');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// PASS 1: Unified Kinetic Delta & Cursor Wing
// Geometric A where the right flank transforms into an acute cursor arrowhead,
// and the crossbar is an air-jet slipstream with glowing beacon.
const pass1_svg = (fillColor = 'url(#aeroGrad)') => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <defs>
    <linearGradient id="aeroGrad" x1="15%" y1="10%" x2="85%" y2="90%">
      <stop offset="0%" stop-color="#7C5CFF" />
      <stop offset="100%" stop-color="#22D3EE" />
    </linearGradient>
  </defs>
  <!-- Apex and Left Stator Wing -->
  <path d="M 50 12 L 18 84 L 34 84 L 43 62 L 57 62 L 50 44 Z" fill="${fillColor}" />
  <!-- Kinetic Right Cursor Wing (Forms right leg of A + terminates in sharp cursor dart) -->
  <path d="M 50 12 L 82 84 L 66 84 L 59 66 L 50 44 Z" fill="${fillColor}" />
  <!-- Supersonic Air Crossbar shooting left-to-right -->
  <polygon points="12,56 74,56 86,46 32,46" fill="${fillColor}" />
  <!-- Pointer beacon at the tip of the kinetic crossbar -->
  <circle cx="86" cy="46" r="5" fill="${fillColor}" />
</svg>
`;

// PASS 2 (Ultimate Refinement):
// Crisp, iconic, mathematically harmonious glyph on an 8-column geometric grid.
// - Apex is an acute 45-degree angle.
// - Left wing is a sleek aerodynamic blade (thickness 14 units).
// - Right wing balances with a clean rake.
// - The crossbar is an accelerating kinetic light trail (starting with 2 trailing speed dashes,
//   cutting through the core, and punching through the right flank into an acute 45-degree cursor pointer).
// - Perfectly legible at 16x16px as a bold 'A' and cursor.
const pass2_refined_svg = (colorMode = 'gradient') => {
  const gradientDef = `
    <defs>
      <linearGradient id="aerokinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#7C5CFF" />
        <stop offset="100%" stop-color="#22D3EE" />
      </linearGradient>
      <linearGradient id="cyanAccent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#22D3EE" />
        <stop offset="100%" stop-color="#38BDF8" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
  `;

  const fill = colorMode === 'gradient' ? 'url(#aerokinGrad)' : colorMode === 'mono-white' ? '#F5F5F7' : '#07070B';
  const tipFill = colorMode === 'gradient' ? 'url(#cyanAccent)' : fill;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  ${gradientDef}
  <!-- Main Delta Frame (The "A") -->
  <!-- Left Wing -->
  <polygon points="50,14 18,84 32,84 45,54 50,42" fill="${fill}" />
  <!-- Right Wing -->
  <polygon points="50,14 55,42 60,54 82,84 68,84" fill="${fill}" />
  
  <!-- Kinetic Slipstream Crossbar cutting through A -->
  <!-- Trailing speed bar on the left -->
  <polygon points="12,56 26,56 32,46 18,46" fill="${fill}" opacity="0.6" />
  
  <!-- Main kinetic crossbar lance with cursor point at right -->
  <!-- Points from inner leg across right wing and piercing outward as an arrow pointer -->
  <polygon points="28,56 78,56 90,46 36,46" fill="${fill}" />
  
  <!-- Beacon Cursor Pulse at point (90, 46) -->
  <circle cx="90" cy="46" r="4" fill="${tipFill}" />
</svg>
  `.trim();
};

// PASS 3 (Peak Minimalist / Iconic Precision):
// Let's create an even sharper, unified single-path / dual-element masterwork:
// 1. The Delta-A Chevron: Clean, solid, powerful, perfectly weighted (20% stroke weight for 16px clarity).
// 2. The Transverse Cursor Beam: A dynamic angled beam passing through the A's crossbar,
//    culminating in an integrated 45-degree mouse cursor arrowhead with a glowing focal dot.
const pass3_master_svg = (colorMode = 'gradient') => {
  const gradientDef = `
    <defs>
      <linearGradient id="aerokinMaster" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#7C5CFF" />
        <stop offset="100%" stop-color="#22D3EE" />
      </linearGradient>
      <filter id="coreGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
  `;

  const fill = colorMode === 'gradient' ? 'url(#aerokinMaster)' : colorMode === 'mono-white' ? '#F5F5F7' : '#07070B';

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  ${gradientDef}
  <!-- Aerokin Delta A: Left Leg, Apex, Right Leg -->
  <!-- Left Foil -->
  <path d="M 50 12 L 16 86 L 31 86 L 44 57 L 50 43 L 56 57 L 69 86 L 84 86 L 50 12 Z M 50 32 L 56 46 L 44 46 Z" fill="${fill}" />

  <!-- Kinetic Crossbar: High-velocity cursor beam shooting through the A -->
  <!-- Left slipstream dash -->
  <polygon points="8,54 22,54 26,46 12,46" fill="${fill}" opacity="0.65" />
  <!-- Main crossbar dart breaking rightward into cursor tip -->
  <path d="M 28 54 L 78 54 L 92 45 L 75 42 L 78 46 L 33 46 Z" fill="${fill}" />
  <!-- Focus beacon point at cursor apex -->
  <circle cx="92" cy="45" r="3.5" fill="#22D3EE" />
</svg>
  `.trim();
};

const SIZES = [16, 32, 64, 180, 512];

async function runRefinement() {
  console.log('Rendering Pass 1, 2, and 3 brand refinements...');

  const passes = [
    { name: 'pass1', svg: pass1_svg() },
    { name: 'pass2-gradient', svg: pass2_refined_svg('gradient') },
    { name: 'pass2-mono', svg: pass2_refined_svg('mono-white') },
    { name: 'pass3-gradient', svg: pass3_master_svg('gradient') },
    { name: 'pass3-mono', svg: pass3_master_svg('mono-white') },
  ];

  for (const { name, svg } of passes) {
    fs.writeFileSync(path.join(OUT_DIR, `${name}.svg`), svg, 'utf8');

    for (const size of SIZES) {
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .flatten({ background: '#07070B' })
        .png()
        .toFile(path.join(OUT_DIR, `${name}-${size}px.png`));
    }
  }

  console.log('Finished refinement pass exports!');
}

runRefinement();
