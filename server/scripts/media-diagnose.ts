/**
 * AEROKIN Media Diagnostic Tool
 *
 * Inspects SMTC sessions and running media processes on the interactive desktop.
 * Run with: npx tsx scripts/media-diagnose.ts
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SmtcAdapter } from '../src/media/SmtcAdapter.js';
import { parseMediaWindowTitle, mapSeekSecondsToVlcHotkey } from '../src/media/ProcessMediaDetector.js';

const execFileAsync = promisify(execFile);

interface ProcessRecord {
  Id: number;
  ProcessName: string;
  MainWindowTitle: string;
}

async function queryRunningMediaProcesses(): Promise<ProcessRecord[]> {
  if (process.platform !== 'win32') return [];

  const targetProcesses = [
    'vlc',
    'mpc-hc64',
    'mpc-hc',
    'potplayermini64',
    'potplayer',
    'spotify',
    'chrome',
    'msedge',
  ];

  const psCmd = `Get-Process -Name ${targetProcesses.join(', ')} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psCmd,
    ]);

    const trimmed = stdout.trim();
    if (!trimmed) return [];

    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed && typeof parsed === 'object') {
      return [parsed];
    }
    return [];
  } catch {
    return [];
  }
}

async function runMediaDiagnostic(): Promise<void> {
  console.log('================================================================');
  console.log('  ✦ AEROKIN MEDIA & SMTC DIAGNOSTIC REPORT ✦');
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Platform: ${process.platform} (${process.arch})`);
  console.log('================================================================\n');

  if (process.platform !== 'win32') {
    console.log('[Notice] Windows is the only supported media controller agent.');
    return;
  }

  // 1. Query SMTC sessions via SmtcAdapter
  console.log('--- 1. Windows SMTC Sessions (GlobalSystemMediaTransportControls) ---');
  const smtc = new SmtcAdapter({ autoStart: true });

  // Give PowerShell sidecar a moment to initialize
  await new Promise((r) => setTimeout(r, 1200));

  let smtcSessions: any[] = [];
  try {
    const status = await smtc.getStatus();
    if (status) {
      smtcSessions = status.sessions || [];
      console.log(`Found ${smtcSessions.length} active SMTC session(s):`);
      for (const s of smtcSessions) {
        console.log(`  • ID: ${s.id}`);
        console.log(`    App: ${s.app}`);
        console.log(`    Title: ${s.title || '(none)'}`);
        console.log(`    Current: ${s.current}`);
        console.log(`    Capabilities: ${JSON.stringify(s.capabilities)}`);
      }
    } else {
      console.log('  No SMTC sessions reported (or sidecar returned empty status).');
    }
  } catch (err) {
    console.warn('  Error retrieving SMTC status:', err);
  } finally {
    smtc.dispose();
  }

  // 2. Query running media processes
  console.log('\n--- 2. Running Media Player Processes ---');
  const procs = await queryRunningMediaProcesses();

  if (procs.length === 0) {
    console.log('  No known media player processes currently running.');
    console.log('  Targeted players checked: vlc, mpc-hc64, potplayer, spotify, chrome, msedge');
  } else {
    console.log(`Found ${procs.length} media-related process instance(s):\n`);

    for (const p of procs) {
      const procExe = `${p.ProcessName}.exe`;
      const winTitle = p.MainWindowTitle || '';
      const inSmtc = smtcSessions.some(
        (s) =>
          s.id.toLowerCase().includes(p.ProcessName.toLowerCase()) ||
          s.app.toLowerCase().includes(p.ProcessName.toLowerCase())
      );

      const parsed = parseMediaWindowTitle(procExe, winTitle);

      console.log(`[PID ${p.Id}] ${procExe}`);
      console.log(`  Window Title : "${winTitle || '(hidden/no window)'}"`);
      console.log(`  Parsed Track : "${parsed.trackTitle}" (Playing: ${parsed.isPlaying})`);
      console.log(`  In SMTC?     : ${inSmtc ? 'YES' : 'NO (fallback session eligible)'}`);

      // Responsive controls explanation
      if (inSmtc) {
        console.log('  Controls     : Managed via Windows SMTC (Tier 2)');
      } else if (p.ProcessName.toLowerCase().includes('vlc')) {
        const shortSeek = mapSeekSecondsToVlcHotkey(3);
        const medSeek = mapSeekSecondsToVlcHotkey(10);
        const longSeek = mapSeekSecondsToVlcHotkey(60);
        console.log('  Controls     : Fallback Hotkeys (Tier 3)');
        console.log('                 • Play/Pause: Space / VK_MEDIA_PLAY_PAUSE');
        console.log(`                 • Seek 3s   : ${shortSeek.key} (${shortSeek.label})`);
        console.log(`                 • Seek 10s  : ${medSeek.key} (${medSeek.label})`);
        console.log(`                 • Seek 1m   : ${longSeek.key} (${longSeek.label})`);
        console.log('                 • Next/Prev : N / P / VK_MEDIA_NEXT / PREV');
        console.log('                 • Stop      : S / VK_MEDIA_STOP');
      } else if (p.ProcessName.toLowerCase().includes('mpc')) {
        console.log('  Controls     : Fallback Hotkeys (Right/Left arrow seek, Space/Media keys)');
      } else {
        console.log('  Controls     : Hardware Media Keys (VK_MEDIA_PLAY_PAUSE, VK_VOLUME_*)');
      }
      console.log('');
    }
  }

  console.log('================================================================');
  console.log('  Diagnostic complete.');
  console.log('================================================================');
}

runMediaDiagnostic().catch((err) => {
  console.error('[Error] Diagnostic script failed:', err);
  process.exit(1);
});
