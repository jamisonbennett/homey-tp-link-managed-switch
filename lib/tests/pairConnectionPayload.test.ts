'use strict';

import { assertPairConnectionFields } from '../pairConnectionPayload';

describe('assertPairConnectionFields', () => {
  it('accepts plain objects with string fields', () => {
    expect(assertPairConnectionFields({
      address: '192.168.0.1',
      username: 'admin',
      password: 'x',
    })).toEqual({
      address: '192.168.0.1',
      username: 'admin',
      password: 'x',
    });
  });

  it('rejects non-objects, arrays, and non-string fields', () => {
    expect(() => assertPairConnectionFields(null)).toThrow('INVALID_PAIR_CONNECTION_PAYLOAD');
    expect(() => assertPairConnectionFields([])).toThrow('INVALID_PAIR_CONNECTION_PAYLOAD');
    expect(() => assertPairConnectionFields({ address: 1, username: 'a', password: 'b' }))
      .toThrow('INVALID_PAIR_CONNECTION_PAYLOAD');
  });
});
