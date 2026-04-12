'use strict';

import { assertValidSwitchPassword, assertValidSwitchUsername } from '../switchCredentials';

describe('assertValidSwitchUsername', () => {
  it('trims and accepts typical values', () => {
    expect(assertValidSwitchUsername('  admin  ')).toBe('admin');
    expect(assertValidSwitchUsername('a'.repeat(128))).toBe('a'.repeat(128));
  });

  it('rejects empty after trim, oversize, non-string, controls', () => {
    expect(() => assertValidSwitchUsername('   ')).toThrow('Invalid username');
    expect(() => assertValidSwitchUsername('a'.repeat(129))).toThrow('Invalid username');
    expect(() => assertValidSwitchUsername(null)).toThrow('Invalid username');
    expect(() => assertValidSwitchUsername('x\ny')).toThrow('Invalid username');
  });
});

describe('assertValidSwitchPassword', () => {
  it('does not trim and allows empty', () => {
    expect(assertValidSwitchPassword('')).toBe('');
    expect(assertValidSwitchPassword('  secret  ')).toBe('  secret  ');
  });

  it('rejects oversize, non-string, controls', () => {
    expect(() => assertValidSwitchPassword('a'.repeat(257))).toThrow('Invalid password');
    expect(() => assertValidSwitchPassword(null)).toThrow('Invalid password');
    expect(() => assertValidSwitchPassword('pw\x00')).toThrow('Invalid password');
    expect(() => assertValidSwitchPassword('x\ry')).toThrow('Invalid password');
  });
});
