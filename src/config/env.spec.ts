import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://localhost/test',
  JWT_SECRET: 'x'.repeat(32),
  CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
};

describe('validateEnv', () => {
  it('defaults admin sessions to 12h', () => {
    expect(validateEnv(base).ADMIN_JWT_EXPIRES_IN).toBe('12h');
  });

  it('refuses TRUST_PROXY=true in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', TRUST_PROXY: 'TRUE' })).toThrow(
      /TRUST_PROXY/,
    );
    expect(validateEnv({ ...base, NODE_ENV: 'production', TRUST_PROXY: '1' }).TRUST_PROXY).toBe('1');
    expect(validateEnv({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe('true');
  });
});
