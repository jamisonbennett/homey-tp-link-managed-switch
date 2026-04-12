'use strict';

import net from 'net';

/** Upper bound for hostname (RFC) plus `:65535`. */
const MAX_INPUT_LEN = 280;

function parsePort(portStr: string): number | null {
  if (!/^\d{1,5}$/.test(portStr)) {
    return null;
  }
  const n = parseInt(portStr, 10);
  if (n < 1 || n > 65535) {
    return null;
  }
  return n;
}

function isValidSwitchHostname(host: string): boolean {
  if (host.length === 0 || host.length > 253) {
    return false;
  }
  const labels = host.split('.');
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) {
      return false;
    }
    if (!/^[a-zA-Z0-9-]+$/.test(label)) {
      return false;
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return false;
    }
  }
  return true;
}

function hasDisallowedHostChars(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) {
      return true;
    }
  }
  return /["'<>\\/@?#%]/.test(s);
}

/**
 * Validates a user-supplied switch address for use in `http://${host}/…` URLs.
 * Allows IPv4, simple hostnames (incl. .local), optional `:port`, and bracketed IPv6 with optional port.
 * Rejects schemes, paths, credentials, and other values that would alter the request URL.
 */
export default function assertValidSwitchHostAddress(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('Invalid switch address');
  }
  const s = raw.trim();
  if (s.length === 0 || s.length > MAX_INPUT_LEN) {
    throw new Error('Invalid switch address');
  }
  if (hasDisallowedHostChars(s)) {
    throw new Error('Invalid switch address');
  }

  const bracketed = /^\[([^\]]+)](?::(\d+))?$/;
  const mBracket = s.match(bracketed);
  if (mBracket) {
    if (!net.isIPv6(mBracket[1])) {
      throw new Error('Invalid switch address');
    }
    if (mBracket[2] !== undefined && parsePort(mBracket[2]) === null) {
      throw new Error('Invalid switch address');
    }
    return s;
  }

  const lastColon = s.lastIndexOf(':');
  if (lastColon === -1) {
    if (net.isIPv4(s) || isValidSwitchHostname(s)) {
      return s;
    }
    throw new Error('Invalid switch address');
  }

  const hostPart = s.slice(0, lastColon);
  const portPart = s.slice(lastColon + 1);
  if (parsePort(portPart) === null) {
    throw new Error('Invalid switch address');
  }
  if (net.isIPv4(hostPart) || isValidSwitchHostname(hostPart)) {
    return s;
  }
  throw new Error('Invalid switch address');
}
