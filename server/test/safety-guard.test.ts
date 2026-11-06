import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NoOpPowerActionExecutor, isTestOrCiEnvironment } from '../src/actions/PowerActionExecutor.js';
import { NoOpInputBackend, RecordingInputBackend } from '../src/input/InputBackend.js';
import { QuickActionService } from '../src/actions/QuickActionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

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

const ALLOWED_EXECUTOR_FILE = path.normalize(
  path.join(ROOT_DIR, 'server', 'src', 'actions', 'PowerActionExecutor.ts')
);

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
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

describe('S1-S5 Hard Safety Guard Test Suite', () => {
  it('strictly forbids raw power and session calls outside PowerActionExecutor.ts', () => {
    const violations: Array<{ file: string; line: number; snippet: string }> = [];

    function scan(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile()) {
          if (IGNORED_FILES.has(entry.name)) continue;
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

          if (path.normalize(fullPath) === ALLOWED_EXECUTOR_FILE) continue;

          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of FORBIDDEN_POWER_PATTERNS) {
              if (pattern.test(line)) {
                violations.push({
                  file: path.relative(ROOT_DIR, fullPath),
                  line: i + 1,
                  snippet: line.trim(),
                });
              }
            }
          }
        }
      }
    }

    scan(ROOT_DIR);
    expect(
      violations,
      `Found forbidden power calls in codebase outside PowerActionExecutor.ts:\n${violations
        .map((v) => `  ${v.file}:${v.line} -> ${v.snippet}`)
        .join('\n')}`
    ).toHaveLength(0);
  });

  it('strictly forbids any test file from importing RealPowerActionExecutor or RealInputBackend', () => {
    const violations: Array<{ file: string; line: number; snippet: string }> = [];

    function scanTests(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanTests(fullPath);
        } else if (entry.isFile()) {
          if (IGNORED_FILES.has(entry.name)) continue;
          if (!entry.name.includes('test') && !entry.name.includes('spec')) continue;

          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of FORBIDDEN_TEST_IMPORTS) {
              if (pattern.test(line)) {
                violations.push({
                  file: path.relative(ROOT_DIR, fullPath),
                  line: i + 1,
                  snippet: line.trim(),
                });
              }
            }
          }
        }
      }
    }

    scanTests(path.join(ROOT_DIR, 'server', 'test'));
    scanTests(path.join(ROOT_DIR, 'pwa', 'test'));

    expect(
      violations,
      `Found forbidden imports of real executor/backend in test files:\n${violations
        .map((v) => `  ${v.file}:${v.line} -> ${v.snippet}`)
        .join('\n')}`
    ).toHaveLength(0);
  });

  it('guarantees RealPowerActionExecutor throws if attempted under vitest / test / CI', async () => {
    expect(isTestOrCiEnvironment()).toBe(true);
    const mod = await import('../src/actions/PowerActionExecutor.js');
    expect(() => new (mod as any).RealPowerActionExecutor()).toThrow(
      /cannot be constructed under vitest \/ test \/ CI environment/i
    );
  });

  it('guarantees RealInputBackend throws if attempted under vitest / test / CI', async () => {
    expect(isTestOrCiEnvironment()).toBe(true);
    const mod = await import('../src/input/InputBackend.js');
    expect(() => new (mod as any).RealInputBackend()).toThrow(
      /cannot be constructed under vitest \/ test \/ CI environment/i
    );
  });

  it('QuickActionService safely defaults to dry-run NoOp executor and Recording backend under test', () => {
    const service = new QuickActionService();
    expect(service.powerExecutor).toBeInstanceOf(NoOpPowerActionExecutor);
    expect(service.inputBackend).toBeInstanceOf(RecordingInputBackend);
  });
});
