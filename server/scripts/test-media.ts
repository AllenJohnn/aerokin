import { MediaManager } from '../src/media-manager.js';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('--- Testing AEROKIN Universal Media Control ---');

  const media = new MediaManager();
  console.log('Waiting 1.5s for media sidecar to connect...');
  await sleep(1500);

  await media.refreshStatus();
  const status = media.getCurrentStatus();

  console.log('\n[Status] Current Sessions count:', status.sessions.length);
  for (const s of status.sessions) {
    console.log(` - Session ID: ${s.id} (current: ${s.current})`);
  }

  console.log('\n[NowPlaying]');
  console.log(' - App:', status.nowPlaying.app || '(none)');
  console.log(' - Title:', status.nowPlaying.title || '(none)');
  console.log(' - Artist:', status.nowPlaying.artist || '(none)');
  console.log(' - Status:', status.nowPlaying.status);
  console.log(' - Position:', status.nowPlaying.position, 's /', status.nowPlaying.duration, 's');
  console.log(' - CanSeek:', status.nowPlaying.canSeek);
  console.log(' - Master Volume:', status.volume, '% (Muted:', status.muted, ')');

  console.log('\n--- Testing Toggle Play/Pause ---');
  const playRes = await media.handleMediaCommand('playpause');
  console.log(`Result: Tier ${playRes.tier}, Handled: ${playRes.handled}, Latency: ${playRes.latencyMs}ms (${playRes.detail})`);

  await sleep(1000);

  console.log('\n--- Testing Seek +10s ---');
  const seekRes = await media.handleMediaCommand('seekby', 10);
  console.log(`Result: Tier ${seekRes.tier}, Handled: ${seekRes.handled}, Latency: ${seekRes.latencyMs}ms (${seekRes.detail})`);

  media.dispose();
  console.log('\n✔ Media control test finished!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test media failed:', err);
  process.exit(1);
});
