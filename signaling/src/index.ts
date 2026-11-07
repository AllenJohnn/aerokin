import { SignalingServer } from './server.js';

export * from './types.js';
export * from './turn.js';
export * from './server.js';

const PORT = parseInt(process.env.PORT || '8088', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Canonical secret is TURN_SECRET. COTURN_SECRET accepted as deprecated alias.
const rawTurnSecret = process.env.TURN_SECRET || process.env.COTURN_SECRET;
if (!process.env.TURN_SECRET && process.env.COTURN_SECRET) {
  console.warn('[SignalingServer] Warning: COTURN_SECRET is deprecated; please use TURN_SECRET.');
}

const COTURN_HOST = process.env.COTURN_HOST || 'turn.aerokin.local';
const COTURN_UDP_PORT = parseInt(process.env.COTURN_UDP_PORT || '3478', 10);
const COTURN_TCP_PORT = parseInt(process.env.COTURN_TCP_PORT || '3478', 10);
const COTURN_TLS_PORT = parseInt(process.env.COTURN_TLS_PORT || '5349', 10);

// Only start standalone server when executed directly as main script
const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMain) {
  if (!rawTurnSecret) {
    console.error('[SignalingServer] Fatal: TURN_SECRET environment variable is required to start SignalingServer.');
    process.exit(1);
  }

  const server = new SignalingServer({
    port: PORT,
    host: HOST,
    turnSecret: rawTurnSecret,
    turnHost: COTURN_HOST,
    turnUdpPort: COTURN_UDP_PORT,
    turnTcpPort: COTURN_TCP_PORT,
    turnTlsPort: COTURN_TLS_PORT,
  });

  server.start().catch((err) => {
    console.error('[SignalingServer] Fatal startup error:', err);
    process.exit(1);
  });

  const shutdown = async () => {
    console.log('\n[SignalingServer] Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
