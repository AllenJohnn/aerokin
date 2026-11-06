#!/usr/bin/env node
/**
 * AEROKIN S5 Static Safety Guard
 *
 * Scans the repository for forbidden power/session calls and dangerous test imports.
 * Exits with 0 if clean; exits with 1 if any violation is found.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const FORBIDDEN_POWER_PATTERNS = [
  /shutdown\.exe/i,
  /powrprof/i,
  /SetSuspendState/i,
  /ExitWindowsEx/i,
  /InitiateSystemShutdownEx/i,
  /LockWorkStation/i,
  /Stop-Computer/i,
  /Restart-Computer/i,
  /\blogoff\b/i,
  /\btsdiscon\b/i,
];

const FORBIDDEN_TEST_IMPORTS = [
  /import\s+[^;]*\bRealPowerActionExecutor\b/i,
  /import\s+[^;]*\bRealInputBackend\b/i,
  /require\s*\([^)]*RealPowerActionExecutor/i,
  /require\s*\([^)]*RealInputBackend/i,
];

// Single allowed power executor file
const ALLOWED_EXECUTOR_FILE = path.normalize(
  path.join(ROOT_DIR, 'server', 'src', 'actions', 'PowerActionExecutor.ts')
);

// Ignored directories
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.gemini',
  '.system_generated',
  'brain',
]);

const IGNORED_FILES = new Set([
  'safety-check.mjs',
  'safety-guard.test.ts',
  'PROGRESS.md',
  'CHANGELOG.md',
  'OVERNIGHT-REPORT.md',
]);

let violations = [];

function scanDirectory(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name)) continue;
      // Skip binary files or lock files
      if (
        entry.name.endsWith('.png') ||
        entry.name.endsWith('.ico') ||
        entry.name.endsWith('.webp') ||
        entry.name.endsWith('.lock') ||
        entry.name.endsWith('.pfx') ||
        entry.name.endsWith('.crt') ||
        entry.name.endsWith('.key')
      ) {
        continue;
      }

      checkFile(fullPath);
    }
  }
}

function checkFile(filePath) {
  const normalized = path.normalize(filePath);
  const relative = path.relative(ROOT_DIR, normalized);
  const isTestFile =
    relative.includes('test') ||
    relative.endsWith('.test.ts') ||
    relative.endsWith('.test.tsx') ||
    relative.endsWith('.spec.ts');

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = content.split('\n');

  // 1. Check for forbidden power patterns if not the single allowed executor
  if (normalized !== ALLOWED_EXECUTOR_FILE) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of FORBIDDEN_POWER_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            file: relative,
            line: i + 1,
            pattern: pattern.toString(),
            snippet: line.trim(),
            type: 'FORBIDDEN_POWER_CALL',
          });
        }
      }
    }
  }

  // 2. Check test files for forbidden real executor/backend imports
  if (isTestFile) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of FORBIDDEN_TEST_IMPORTS) {
        if (pattern.test(line)) {
          violations.push({
            file: relative,
            line: i + 1,
            pattern: pattern.toString(),
            snippet: line.trim(),
            type: 'FORBIDDEN_TEST_IMPORT',
          });
        }
      }
    }
  }
}

console.log('[safety:check] Scanning repository for S1-S5 safety violations...');
scanDirectory(ROOT_DIR);

if (violations.length > 0) {
  console.error('\n🚨 SAFETY CHECK FAILED! Found forbidden power calls or test imports:');
  for (const v of violations) {
    console.error(`  [${v.type}] ${v.file}:${v.line}`);
    console.error(`    Pattern: ${v.pattern}`);
    console.error(`    Code:    ${v.snippet}\n`);
  }
  process.exit(1);
} else {
  console.log('✅ SAFETY CHECK PASSED: 0 forbidden power calls, 0 forbidden test imports.');
  console.log(`   All power actions strictly isolated in: server/src/actions/PowerActionExecutor.ts`);
  process.exit(0);
}
