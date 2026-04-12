'use strict';

import assertValidSwitchHostAddress from '../switchHostAddress';

describe('assertValidSwitchHostAddress', () => {
  const ok = (raw: string, expected?: string) => {
    expect(assertValidSwitchHostAddress(raw)).toBe(expected ?? raw.trim());
  };
  const bad = (raw: unknown) => {
    expect(() => assertValidSwitchHostAddress(raw)).toThrow('Invalid switch address');
  };

  it('accepts IPv4 and trims', () => {
    ok('192.168.0.1', '192.168.0.1');
    ok('  10.0.0.1  ', '10.0.0.1');
  });

  it('accepts IPv4 with port', () => {
    ok('192.168.0.1:80');
    ok('192.168.0.1:65535');
  });

  it('accepts hostnames and .local', () => {
    ok('managed-switch.local');
    ok('switch-1');
    ok('a.example.com');
  });

  it('accepts hostname with port', () => {
    ok('managed-switch.local:8080');
  });

  it('accepts bracketed IPv6 with optional port', () => {
    ok('[::1]');
    ok('[fe80::1]:443');
  });

  it('rejects schemes, paths, query, userinfo, and escapes', () => {
    bad('http://192.168.0.1');
    bad('192.168.0.1/evil');
    bad('192.168.0.1?x=1');
    bad('user@192.168.0.1');
    bad('192.168.0.1%2f');
    bad('\\\\server\\share');
  });

  it('rejects bad ports and ambiguous host', () => {
    bad('192.168.0.1:0');
    bad('192.168.0.1:65536');
    bad('192.168.0.1:notaport');
    bad('host:abc');
  });

  it('rejects empty, non-string, oversize, and control characters', () => {
    bad('');
    bad('   ');
    bad(null);
    bad(123);
    bad('a\nb');
    bad('x\x00y');
  });

  it('rejects raw IPv6 without brackets (ambiguous with port)', () => {
    bad('::1');
    bad('fe80::1');
  });

  it('rejects invalid IPv6 in brackets', () => {
    bad('[gggg::1]');
  });
});
