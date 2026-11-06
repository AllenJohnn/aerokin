/**
 * AEROKIN Hosted Mode & Host Address Validation Utilities
 */

export const STORAGE_HOST_KEY = 'aerokin_server_host';
export const STORAGE_TOKEN_KEY = 'aerokin_auth_token';
export const STORAGE_DEVICE_ID_KEY = 'aerokin_device_id';
export const STORAGE_CREDENTIAL_KEY = 'aerokin_device_credential';
export const STORAGE_DEVICE_NAME_KEY = 'aerokin_device_name';
export const STORAGE_SAVED_PCS_KEY = 'aerokin_saved_pcs';
export const STORAGE_ACTIVE_PC_KEY = 'aerokin_active_pc_id';
export const STORAGE_SIGNALING_KEY = 'aerokin_signaling_url';
export const STORAGE_PC_ID_KEY = 'aerokin_target_pc_id';

export interface SavedPc {
  pcId: string;
  name: string;
  deviceId: string;
  credential: string;
  lanHost?: string;
  signalingUrl?: string;
  lastSeen: number;
  pairedVia: 'lan' | 'remote';
}

/**
 * Returns the list of all saved PCs from localStorage.
 */
export function getSavedPcs(): SavedPc[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_SAVED_PCS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Returns a specific saved PC by pcId.
 */
export function getSavedPc(pcId: string): SavedPc | null {
  const pcs = getSavedPcs();
  return pcs.find((p) => p.pcId === pcId) || null;
}

/**
 * Saves or updates a PC record in the saved PCs store and updates active PC id.
 */
export function savePc(pc: SavedPc): void {
  if (typeof window === 'undefined') return;
  const pcs = getSavedPcs().filter((p) => p.pcId !== pc.pcId);
  pcs.unshift(pc);
  try {
    localStorage.setItem(STORAGE_SAVED_PCS_KEY, JSON.stringify(pcs));
    localStorage.setItem(STORAGE_ACTIVE_PC_KEY, pc.pcId);
    // Also sync legacy active device keys for backward compatibility
    saveStoredDeviceCredentials(pc.deviceId, pc.credential, pc.name);
    if (pc.lanHost) {
      localStorage.setItem(STORAGE_HOST_KEY, pc.lanHost);
    }
    if (pc.signalingUrl) {
      localStorage.setItem(STORAGE_SIGNALING_KEY, pc.signalingUrl);
    }
  } catch {}
}

/**
 * Removes a saved PC and clears active state if needed.
 */
export function removeSavedPc(pcId: string): void {
  if (typeof window === 'undefined') return;
  const pcs = getSavedPcs().filter((p) => p.pcId !== pcId);
  try {
    localStorage.setItem(STORAGE_SAVED_PCS_KEY, JSON.stringify(pcs));
    const active = getActivePcId();
    if (active === pcId) {
      if (pcs.length > 0) {
        setActivePcId(pcs[0].pcId);
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_PC_KEY);
        clearStoredDeviceCredentials();
      }
    }
  } catch {}
}

/**
 * Gets the active PC ID.
 */
export function getActivePcId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_ACTIVE_PC_KEY);
}

/**
 * Sets the active PC by ID and switches active device credentials.
 */
export function setActivePcId(pcId: string): boolean {
  if (typeof window === 'undefined') return false;
  const pc = getSavedPc(pcId);
  if (!pc) return false;
  localStorage.setItem(STORAGE_ACTIVE_PC_KEY, pcId);
  saveStoredDeviceCredentials(pc.deviceId, pc.credential, pc.name);
  if (pc.lanHost) {
    localStorage.setItem(STORAGE_HOST_KEY, pc.lanHost);
  }
  if (pc.signalingUrl) {
    localStorage.setItem(STORAGE_SIGNALING_KEY, pc.signalingUrl);
  }
  return true;
}

/**
 * Returns the currently active SavedPc.
 */
export function getActivePc(): SavedPc | null {
  const activeId = getActivePcId();
  if (activeId) {
    const pc = getSavedPc(activeId);
    if (pc) return pc;
  }
  const all = getSavedPcs();
  return all.length > 0 ? all[0] : null;
}

/**
 * Returns stored cryptographic device credentials from localStorage.
 */
export function getStoredDeviceCredentials(): {
  deviceId: string | null;
  credential: string | null;
  name: string | null;
} {
  if (typeof window === 'undefined') {
    return { deviceId: null, credential: null, name: null };
  }
  return {
    deviceId: localStorage.getItem(STORAGE_DEVICE_ID_KEY),
    credential: localStorage.getItem(STORAGE_CREDENTIAL_KEY),
    name: localStorage.getItem(STORAGE_DEVICE_NAME_KEY),
  };
}

/**
 * Saves per-device cryptographic credentials to localStorage.
 */
export function saveStoredDeviceCredentials(
  deviceId: string,
  credential: string,
  name?: string
): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_DEVICE_ID_KEY, deviceId);
  localStorage.setItem(STORAGE_CREDENTIAL_KEY, credential);
  if (name) {
    localStorage.setItem(STORAGE_DEVICE_NAME_KEY, name);
  }
}

/**
 * Clears stored device credentials and pairing tokens from localStorage.
 */
export function clearStoredDeviceCredentials(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_DEVICE_ID_KEY);
  localStorage.removeItem(STORAGE_CREDENTIAL_KEY);
  localStorage.removeItem(STORAGE_DEVICE_NAME_KEY);
  localStorage.removeItem(STORAGE_TOKEN_KEY);
}

/**
 * Returns true if the PWA is built in hosted mode (e.g. for Vercel, Netlify, custom static host),
 * and false when built to be served directly by the local PC agent.
 *
 * This is a BUILD-TIME decision controlled via Vite mode and env files:
 * - pwa/.env.hosted sets VITE_HOSTED_MODE=true
 * - pwa/.env.production sets VITE_HOSTED_MODE=false
 *
 * Dev and test environments default to false unless VITE_HOSTED_MODE is explicitly 'true'.
 */
export function isHostedMode(): boolean {
  return import.meta.env?.VITE_HOSTED_MODE === 'true';
}

export interface HostValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validates host input for connecting to the local PC agent.
 * Accepts hostname or IPv4 with optional port (e.g. "192.168.1.50:8443" or "aerokin.local:8443").
 * Rejects schemes (http://, https://, ws://, wss://) and paths/queries.
 */
export function validateHost(input: unknown): HostValidationResult {
  if (typeof input !== 'string') {
    return { valid: false, error: 'Host must be a string' };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Host cannot be empty' };
  }

  // Reject schemes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) {
    return {
      valid: false,
      error: 'Do not include http://, https://, or wss://. Enter IP:port or hostname only.',
    };
  }

  // Reject slashes or path/query characters
  if (/[/?#\\]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Do not include slashes or paths. Enter host:port only (e.g. 192.168.1.50:8443).',
    };
  }

  // Match <host> or <host>:<port>
  const portMatch = trimmed.match(/^(.+):(\d+)$/);
  let hostPart = trimmed;
  let portPart: number | null = null;

  if (portMatch) {
    hostPart = portMatch[1];
    portPart = parseInt(portMatch[2], 10);

    if (isNaN(portPart) || portPart < 1 || portPart > 65535) {
      return { valid: false, error: 'Port must be between 1 and 65535' };
    }
  }

  // Validate hostname or IPv4
  const isDottedNumeric = /^[\d.]+$/.test(hostPart);

  if (isDottedNumeric) {
    const isIPv4 =
      /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(hostPart) &&
      hostPart.split('.').every((octet) => {
        const n = parseInt(octet, 10);
        return n >= 0 && n <= 255;
      });

    if (!isIPv4) {
      return {
        valid: false,
        error: 'Invalid IPv4 address. Each octet must be between 0 and 255.',
      };
    }
  } else {
    const isHostname = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
      hostPart
    );

    if (!isHostname) {
      return {
        valid: false,
        error: 'Invalid host. Must be a valid IPv4 address or hostname (e.g. 192.168.1.50 or aerokin.local).',
      };
    }
  }

  const normalized = portPart ? `${hostPart}:${portPart}` : `${hostPart}:8443`;
  return { valid: true, normalized };
}

export interface UrlConnectionParams {
  host: string | null;
  code: string | null;
  pcId: string | null;
  signalingUrl: string | null;
}

/**
 * Parses connection parameters from URL hash fragment (#host=<host>&code=<code>&pcId=<pcId>&signaling=<url>)
 * or search query parameters, saves them to localStorage, and immediately strips sensitive parameters
 * from the address bar via history.replaceState so sensitive credentials do not remain in URL history.
 *
 * Never logs credentials.
 */
export function consumeConnectionFragment(): UrlConnectionParams {
  if (typeof window === 'undefined') {
    return { host: null, code: null, pcId: null, signalingUrl: null };
  }

  let host: string | null = null;
  let code: string | null = null;
  let pcId: string | null = null;
  let signalingUrl: string | null = null;

  try {
    // 1. Check URL hash fragment (e.g. #host=192.168.1.50:8443&code=4EA378)
    const hashContent = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hashContent);

    const rawHost = hashParams.get('host') || searchParams.get('host');
    const rawCode = hashParams.get('code') || searchParams.get('code');
    const rawPcId = hashParams.get('pcId') || searchParams.get('pcId');
    const rawSignaling = hashParams.get('signaling') || searchParams.get('signaling');

    if (rawHost) {
      const validated = validateHost(rawHost);
      if (validated.valid && validated.normalized) {
        host = validated.normalized;
        localStorage.setItem(STORAGE_HOST_KEY, host);
      }
    }

    if (rawCode && rawCode.trim().length > 0) {
      code = rawCode.trim().toUpperCase();
      localStorage.setItem(STORAGE_TOKEN_KEY, code);
    }

    if (rawPcId && rawPcId.trim().startsWith('pc_')) {
      pcId = rawPcId.trim();
      localStorage.setItem(STORAGE_PC_ID_KEY, pcId);
    }

    if (rawSignaling && rawSignaling.trim().length > 0) {
      signalingUrl = rawSignaling.trim();
      localStorage.setItem(STORAGE_SIGNALING_KEY, signalingUrl);
    }

    // Immediately remove sensitive params from address bar so they do not remain in history
    if (rawHost || rawCode || rawPcId || rawSignaling) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  } catch {}

  // 2. Fallback to existing localStorage if not provided in fragment/query
  if (!host) {
    host = localStorage.getItem(STORAGE_HOST_KEY) || null;
  }
  if (!code) {
    code = localStorage.getItem(STORAGE_TOKEN_KEY) || null;
  }
  if (!pcId) {
    pcId = localStorage.getItem(STORAGE_PC_ID_KEY) || null;
  }
  if (!signalingUrl) {
    signalingUrl = localStorage.getItem(STORAGE_SIGNALING_KEY) || null;
  }

  return { host, code, pcId, signalingUrl };
}

/**
 * Builds the plain-HTTP trust server URL for downloading CA certificates and profiles.
 * The trust server operates on port 8080 (plain HTTP) while the agent runs on 8443 (HTTPS).
 *
 * Strips any port from host and points to trustPort (default 8080).
 */
export function buildTrustUrl(host: string, trustPort = 8080): string {
  const trimmed = (host || '').trim();
  if (!trimmed) return `http://localhost:${trustPort}/`;
  const withoutProto = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i, '');
  const hostPart = withoutProto.split(/[/?#]/)[0];

  let hostname = hostPart;
  if (hostPart.startsWith('[') && hostPart.includes(']')) {
    const endBracket = hostPart.indexOf(']');
    hostname = hostPart.slice(0, endBracket + 1);
  } else if (hostPart.includes(':')) {
    hostname = hostPart.split(':')[0];
  }

  return `http://${hostname}:${trustPort}/`;
}
