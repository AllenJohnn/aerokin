import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicAssetsDir = path.resolve(__dirname, '../server/public/assets');
const publicHtmlPath = path.resolve(__dirname, '../server/public/index.html');

if (!fs.existsSync(publicAssetsDir) || !fs.existsSync(publicHtmlPath)) {
  console.log('[Prune] No public assets directory found to prune.');
  process.exit(0);
}

const htmlContent = fs.readFileSync(publicHtmlPath, 'utf8');
const files = fs.readdirSync(publicAssetsDir);

let prunedCount = 0;
for (const file of files) {
  if (file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.map')) {
    // Check if directly or indirectly referenced
    const filePath = path.join(publicAssetsDir, file);
    // If not referenced anywhere in HTML or in any existing JS/CSS file in assets
    let referenced = htmlContent.includes(file);
    if (!referenced) {
      for (const otherFile of files) {
        if (otherFile !== file && (otherFile.endsWith('.js') || otherFile.endsWith('.css'))) {
          const content = fs.readFileSync(path.join(publicAssetsDir, otherFile), 'utf8');
          if (content.includes(file)) {
            referenced = true;
            break;
          }
        }
      }
    }

    if (!referenced && !file.includes('vendor-') && !file.includes('index-')) {
      fs.unlinkSync(filePath);
      prunedCount++;
      console.log(`[Prune] Removed obsolete build artifact: ${file}`);
    }
  }
}

console.log(`[Prune] Prune check complete. Pruned ${prunedCount} obsolete files.`);
