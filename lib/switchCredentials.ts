'use strict';

/** App-side limits only; generous for typical admin UIs. */
const MAX_USERNAME_LEN = 128;
const MAX_PASSWORD_LEN = 256;

function hasDisallowedCredentialChars(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Validates username for this app: trim edges, non-empty, length cap, no C0 / DEL controls.
 * (Not TP-Link firmware limits.)
 */
export function assertValidSwitchUsername(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('Invalid username');
  }
  const s = raw.trim();
  if (s.length === 0 || s.length > MAX_USERNAME_LEN) {
    throw new Error('Invalid username');
  }
  if (hasDisallowedCredentialChars(s)) {
    throw new Error('Invalid username');
  }
  return s;
}

/**
 * Validates password for this app: no trimming, length cap, no C0 / DEL controls. Empty allowed.
 */
export function assertValidSwitchPassword(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('Invalid password');
  }
  if (raw.length > MAX_PASSWORD_LEN) {
    throw new Error('Invalid password');
  }
  if (hasDisallowedCredentialChars(raw)) {
    throw new Error('Invalid password');
  }
  return raw;
}
