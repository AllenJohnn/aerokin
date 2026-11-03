import { Bonjour } from 'bonjour-service';

export interface MdnsServiceHandle {
  stop: () => void;
}

/**
 * Best-effort mDNS advertisement of aerokin.local
 */
export function startMdnsAdvertisement(port: number, lanIp: string): MdnsServiceHandle {
  try {
    const bonjour = new Bonjour();

    const service = bonjour.publish({
      name: 'AEROKIN Local Server',
      type: 'https',
      port,
      host: 'aerokin.local',
      txt: {
        app: 'aerokin',
        ip: lanIp,
      },
    });

    service.on('error', (err) => {
      console.warn('[mDNS] Advertisement warning:', err.message);
    });

    console.log('[mDNS] Advertising aerokin.local on local network');

    return {
      stop() {
        try {
          bonjour.unpublishAll(() => {
            bonjour.destroy();
          });
        } catch {}
      },
    };
  } catch (err: any) {
    console.warn('[mDNS] Could not start mDNS service:', err.message);
    return {
      stop() {},
    };
  }
}
