'use strict';

import {
  assertLedStateFromDevice,
  assertLogonResponseCode,
  assertPortCountFromDevice,
  assertValidDescriptionString,
  assertValidPairedDeviceMacId,
  assertValidSessionCookieHeaderPair,
  mapZeroOneToBooleans,
  normalizeMacFromDeviceHtml,
  parsePortTableIntegers,
} from '../switchDeviceWebData';

describe('normalizeMacFromDeviceHtml', () => {
  it('normalizes colon, hyphen, and compact hex', () => {
    expect(normalizeMacFromDeviceHtml('00:11:22:33:44:55')).toBe('00:11:22:33:44:55');
    expect(normalizeMacFromDeviceHtml('00-11-22-33-44-55')).toBe('00:11:22:33:44:55');
    expect(normalizeMacFromDeviceHtml('001122334455')).toBe('00:11:22:33:44:55');
  });

  it('rejects wrong length', () => {
    expect(() => normalizeMacFromDeviceHtml('00:11:22:33:44')).toThrow('Invalid MAC');
  });
});

describe('parsePortTableIntegers', () => {
  it('parses first N entries', () => {
    expect(parsePortTableIntegers('1, 0, 6, 6', 4, 'test')).toEqual([1, 0, 6, 6]);
  });

  it('rejects short lists', () => {
    expect(() => parsePortTableIntegers('1,2', 5, 'test')).toThrow('Incomplete');
  });
});

describe('mapZeroOneToBooleans', () => {
  it('accepts only 0 and 1', () => {
    expect(mapZeroOneToBooleans([1, 0], 'x')).toEqual([true, false]);
    expect(() => mapZeroOneToBooleans([2], 'x')).toThrow('Invalid');
  });
});

describe('assertValidSessionCookieHeaderPair', () => {
  it('accepts typical H_P_SSID', () => {
    expect(assertValidSessionCookieHeaderPair('H_P_SSID=abc123; Path=/')).toBe('H_P_SSID=abc123');
  });

  it('rejects injection-prone values', () => {
    expect(() => assertValidSessionCookieHeaderPair('H_P_SSID=bad value; Path=/')).toThrow('Invalid');
  });
});

describe('assertPortCountFromDevice', () => {
  it('bounds port count', () => {
    expect(assertPortCountFromDevice(8)).toBe(8);
    expect(() => assertPortCountFromDevice(0)).toThrow('Invalid');
    expect(() => assertPortCountFromDevice(49)).toThrow('Invalid');
  });
});

describe('assertLedStateFromDevice', () => {
  it('accepts 0 and 1', () => {
    expect(assertLedStateFromDevice(0)).toBe(false);
    expect(assertLedStateFromDevice(1)).toBe(true);
    expect(() => assertLedStateFromDevice(2)).toThrow('Invalid');
  });
});

describe('assertLogonResponseCode', () => {
  it('accepts typical codes', () => {
    expect(assertLogonResponseCode(0)).toBe(0);
    expect(assertLogonResponseCode(6)).toBe(6);
  });

  it('rejects absurd values', () => {
    expect(() => assertLogonResponseCode(99)).toThrow('Invalid');
  });
});

describe('assertValidDescriptionString', () => {
  it('rejects controls', () => {
    expect(() => assertValidDescriptionString('a\nb')).toThrow(/invalid/i);
  });
});

describe('assertValidPairedDeviceMacId', () => {
  it('normalizes like HTML MAC', () => {
    expect(assertValidPairedDeviceMacId('00:11:22:33:44:55')).toBe('00:11:22:33:44:55');
  });

  it('rejects non-strings and bad MACs', () => {
    expect(() => assertValidPairedDeviceMacId(null)).toThrow('Invalid paired device id');
    expect(() => assertValidPairedDeviceMacId('not-a-mac')).toThrow('Invalid MAC');
  });
});
