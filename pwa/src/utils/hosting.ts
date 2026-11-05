/**
 * AEROKIN Hosted Mode & Host Address Validation Utilities
 */

export const STORAGE_HOST_KEY = 'aerokin_server_host';
export const STORAGE_TOKEN_KEY = 'aerokin_auth_token';

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
}

/**
 * Parses connection parameters from URL hash fragment (#host=<host>&code=<code>),
 * saves them to localStorage, and immediately strips the hash from the address bar
 * via history.replaceState so sensitive credentials do not remain in URL history.
 *
 * Never logs credentials.
 */
export function consumeConnectionFragment(): UrlConnectionParams {
  if (typeof window === 'undefined') {
    return { host: null, code: null };
  }

  let host: string | null = null;
  let code: string | null = null;

  // 1. Check URL hash fragment (e.g. #host=192.168.1.50:8443&code=4EA378)
  if (window.location.hash && window.location.hash.length > 1) {
    try {
      const hashContent = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;

      const params = new URLSearchParams(hashContent);
      const rawHost = params.get('host');
      const rawCode = params.get('code');

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

      // Immediately remove fragment from address bar so it does not remain in history
      if (host || code) {
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, '', cleanUrl);
      }
    } catch {}
  }

  // 2. Fallback to existing localStorage if not provided in fragment
  if (!host) {
    host = localStorage.getItem(STORAGE_HOST_KEY) || null;
  }
  if (!code) {
    code = localStorage.getItem(STORAGE_TOKEN_KEY) || null;
  }

  return { host, code };
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
