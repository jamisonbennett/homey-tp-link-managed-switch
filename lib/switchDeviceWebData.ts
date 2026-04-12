'use strict';

/** Matches driver.flow.compose.json and caps what we accept from HTML payloads. */
export const MAX_SWITCH_PORT_COUNT = 48;

const MAX_FIRMWARE_HARDWARE_LEN = 512;
const MAX_DESCRIPTION_LEN = 256;
const MAX_SESSION_COOKIE_VALUE_LEN = 512;
/**
 * Max absolute value for integers in port table arrays from HTML (`spd_cfg`, `spd_act`, etc.).
 * This is not the number of physical ports (see {@link MAX_SWITCH_PORT_COUNT}). Firmware uses
 * small speed/link codes; a 16-bit-style bound rejects garbage without implying real values go that high.
 */
const MAX_ABS_PORT_TABLE_INT = 65_535;

function hasDisallowedWebTextChars(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Validates a string parsed from TP-Link HTML/JS (description, version labels).
 * Does not trim; rejects control characters and excessive length.
 */
export function assertValidDeviceHtmlLabel(raw: string, maxLen: number): string {
  if (raw.length > maxLen) {
    throw new Error('Device response field too long');
  }
  if (hasDisallowedWebTextChars(raw)) {
    throw new Error('Device response contains invalid characters');
  }
  return raw;
}

export function assertValidFirmwareVersionString(raw: string): string {
  return assertValidDeviceHtmlLabel(raw, MAX_FIRMWARE_HARDWARE_LEN);
}

export function assertValidHardwareVersionString(raw: string): string {
  return assertValidDeviceHtmlLabel(raw, MAX_FIRMWARE_HARDWARE_LEN);
}

export function assertValidDescriptionString(raw: string): string {
  return assertValidDeviceHtmlLabel(raw, MAX_DESCRIPTION_LEN);
}

/**
 * Normalizes MAC from device pages (colon, hyphen, or bare hex) to lowercase aa:bb:cc:dd:ee:ff.
 */
export function normalizeMacFromDeviceHtml(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '');
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) {
    throw new Error('Invalid MAC address in device response');
  }
  const lower = hex.toLowerCase();
  return lower.match(/.{2}/g)!.join(':');
}

/** Validates Homey device `data.id` (paired MAC) using the same rules as HTML-parsed MACs. */
export function assertValidPairedDeviceMacId(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('Invalid paired device id');
  }
  return normalizeMacFromDeviceHtml(raw);
}

export function assertPortCountFromDevice(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > MAX_SWITCH_PORT_COUNT) {
    throw new Error('Invalid port count in device response');
  }
  return n;
}

/**
 * Parses the first {@code numPorts} comma-separated integers from a device JS array body.
 */
export function parsePortTableIntegers(segment: string, numPorts: number, name: string): number[] {
  const parts = segment.split(',').map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length < numPorts) {
    throw new Error(`Incomplete ${name} data in device response`);
  }
  const out: number[] = [];
  for (let i = 0; i < numPorts; i += 1) {
    const n = parseInt(parts[i], 10);
    if (!Number.isInteger(n) || n < -MAX_ABS_PORT_TABLE_INT || n > MAX_ABS_PORT_TABLE_INT) {
      throw new Error(`Invalid ${name} value in device response`);
    }
    out.push(n);
  }
  return out;
}

export function mapZeroOneToBooleans(nums: number[], name: string): boolean[] {
  return nums.map((n, idx) => {
    if (n !== 0 && n !== 1) {
      throw new Error(`Invalid ${name} flag at position ${idx + 1} in device response`);
    }
    return n === 1;
  });
}

/** spd_act: non-zero means link up (per TP-Link page semantics). */
export function mapSpeedActToLinkUp(nums: number[]): boolean[] {
  return nums.map(n => n !== 0);
}

export function assertLedStateFromDevice(n: number): boolean {
  if (n !== 0 && n !== 1) {
    throw new Error('Invalid LED state in device response');
  }
  return n === 1;
}

export function assertLogonResponseCode(code: number): number {
  if (!Number.isInteger(code) || code < -32 || code > 32) {
    throw new Error('Invalid login response code in device response');
  }
  return code;
}

/**
 * Validates H_P_SSID cookie name=value segment before sending in Cookie header.
 */
export function assertValidSessionCookieHeaderPair(rawPair: string): string {
  const part = rawPair.split(';')[0].trim();
  if (!part.startsWith('H_P_SSID=')) {
    throw new Error('Invalid session cookie from device');
  }
  const value = part.slice('H_P_SSID='.length);
  if (value.length === 0 || value.length > MAX_SESSION_COOKIE_VALUE_LEN) {
    throw new Error('Invalid session cookie value from device');
  }
  if (/[\s\x00-\x1f\x7f";\\]/.test(value)) {
    throw new Error('Invalid session cookie value from device');
  }
  return part;
}
