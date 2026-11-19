import os from 'node:os';
import { Bonjour } from 'bonjour-service';

export interface MdnsServiceHandle {
  stop: () => void;
}

/**
 * Best-effort mDNS advertisement of aerokin.local and <hostname>.local.
 * Completely guarded against network crashes; never throws or crashes the server.
 */
export function startMdnsAdvertisement(
  port: number,
  lanIp: string,
  customHost?: string
): MdnsServiceHandle {
  try {
    const bonjour = new Bonjour();
    const host = customHost || os.hostname() || 'aerokin';
    const localHost = host.toLowerCase().endsWith('.local')
      ? host.toLowerCase()
      : `${host.toLowerCase()}.local`;

    const service = bonjour.publish({
      name: `AEROKIN Local Server (${host})`,
      type: 'https',
      port,
      host: 'aerokin.local',
      txt: {
        app: 'aerokin',
        ip: lanIp,
        host: localHost,
      },
    });

    service.on('error', (err) => {
      console.warn('[mDNS] Advertisement warning:', err?.message || err);
    });

    console.log(`[mDNS] Advertising aerokin.local and ${localHost} on local network`);

    return {
      stop() {
        try {
          bonjour.unpublishAll(() => {
            try {
              bonjour.destroy();
            } catch {}
          });
        } catch {}
      },
    };
  } catch (err: any) {
    console.warn('[mDNS] Could not start mDNS service:', err?.message || err);
    return {
      stop() {},
    };
  }
}
