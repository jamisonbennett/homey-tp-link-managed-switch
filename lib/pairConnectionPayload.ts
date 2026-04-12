'use strict';

export interface PairConnectionFields {
  address: string;
  username: string;
  password: string;
}

/**
 * Ensures pair/repair `set_connection_info` payloads are plain objects with string fields.
 */
export function assertPairConnectionFields(data: unknown): PairConnectionFields {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('INVALID_PAIR_CONNECTION_PAYLOAD');
  }
  const d = data as Record<string, unknown>;
  if (typeof d.address !== 'string' || typeof d.username !== 'string' || typeof d.password !== 'string') {
    throw new Error('INVALID_PAIR_CONNECTION_PAYLOAD');
  }
  return {
    address: d.address,
    username: d.username,
    password: d.password,
  };
}
