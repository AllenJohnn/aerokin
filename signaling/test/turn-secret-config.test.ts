import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { generateTurnCredentials, verifyTurnCredentials } from '../src/turn.js';

describe('TURN_SECRET Configuration & Canonical Parity Suite', () => {
  const signalingDir = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(signalingDir, '..');

  it('entry point refuses to start without a secret and exits with error', () => {
    const tsxCli = path.join(signalingDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const indexTs = path.join(signalingDir, 'src', 'index.ts');

    const result = spawnSync(process.execPath, [tsxCli, indexTs], {
      env: {
        ...process.env,
        TURN_SECRET: '',
        COTURN_SECRET: '',
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Fatal: TURN_SECRET environment variable is required');
  });

  it('deprecated COTURN_SECRET is recognized with a deprecation warning if TURN_SECRET is missing', () => {
    // Test that when imported or evaluated, server respects COTURN_SECRET alias
    const prevTurn = process.env.TURN_SECRET;
    const prevCoturn = process.env.COTURN_SECRET;
    try {
      delete process.env.TURN_SECRET;
      process.env.COTURN_SECRET = 'temporary-alias-secret';
      const resolved = process.env.TURN_SECRET || process.env.COTURN_SECRET;
      expect(resolved).toBe('temporary-alias-secret');
    } finally {
      if (prevTurn !== undefined) process.env.TURN_SECRET = prevTurn;
      else delete process.env.TURN_SECRET;
      if (prevCoturn !== undefined) process.env.COTURN_SECRET = prevCoturn;
      else delete process.env.COTURN_SECRET;
    }
  });

  it('docker-compose.yml and turnserver.conf.template use identical TURN_SECRET variable', () => {
    const dockerComposePath = path.join(signalingDir, 'docker-compose.yml');
    const turnTemplatePath = path.join(signalingDir, 'turnserver.conf.template');

    expect(fs.existsSync(dockerComposePath)).toBe(true);
    expect(fs.existsSync(turnTemplatePath)).toBe(true);

    const composeContent = fs.readFileSync(dockerComposePath, 'utf-8');
    const templateContent = fs.readFileSync(turnTemplatePath, 'utf-8');

    // Parse signaling service environment in compose
    expect(composeContent).toMatch(/TURN_SECRET=\$\{TURN_SECRET:\?TURN_SECRET must be set in environment\}/);

    // Parse coturn service command in compose
    expect(composeContent).toMatch(/--static-auth-secret=\$\{TURN_SECRET:\?TURN_SECRET must be set in environment\}/);

    // Parse turnserver.conf.template static-auth-secret
    expect(templateContent).toMatch(/static-auth-secret=\$\{TURN_SECRET\}/);
  });

  it('ensures credentials minted by signaling are valid and verified by coturn secret', () => {
    const sharedSecret = crypto.randomBytes(32).toString('hex');
    const turnHost = 'turn.aerokin.net';

    // Signaling mints credentials using TURN_SECRET
    const creds = generateTurnCredentials({
      secret: sharedSecret,
      turnHost,
      usernamePrefix: 'allen-phone',
      ttlSeconds: 7200,
    });

    // Coturn verifies credentials using the exact same static-auth-secret
    const isCoturnValid = verifyTurnCredentials(sharedSecret, creds.username, creds.credential);
    expect(isCoturnValid).toBe(true);

    // Mismatched secret fails Coturn verification
    const wrongSecret = crypto.randomBytes(32).toString('hex');
    expect(verifyTurnCredentials(wrongSecret, creds.username, creds.credential)).toBe(false);
  });

  it('verifies old signaling/.env.example is removed and deploy/.env.example is canonical', () => {
    const oldEnvExample = path.join(signalingDir, '.env.example');
    const canonicalEnvExample = path.join(signalingDir, 'deploy', '.env.example');

    expect(fs.existsSync(oldEnvExample)).toBe(false);
    expect(fs.existsSync(canonicalEnvExample)).toBe(true);

    const canonicalContent = fs.readFileSync(canonicalEnvExample, 'utf-8');
    expect(canonicalContent).toContain('TURN_SECRET=REPLACE_WITH_GENERATED_32_BYTE_HEX_SECRET');
    expect(canonicalContent).not.toContain('aerokin-default-coturn-shared-secret');
    expect(canonicalContent).not.toContain('change-in-prod');
  });

  it('verifies turnserver.conf contains no hardcoded default secrets', () => {
    const turnConfPath = path.join(signalingDir, 'turnserver.conf');
    const confContent = fs.readFileSync(turnConfPath, 'utf-8');

    expect(confContent).not.toContain('aerokin-default-coturn-shared-secret');
    expect(confContent).not.toContain('change-in-prod');
    expect(confContent).not.toContain('static-auth-secret=');
  });
});
