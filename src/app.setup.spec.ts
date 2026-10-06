import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from './app.setup.js';

describe('parseTrustProxy', () => {
  it('reads hop counts, booleans and address lists', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('FALSE')).toBe(false);
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('10.0.0.0/8, loopback')).toBe('10.0.0.0/8, loopback');
  });
});
