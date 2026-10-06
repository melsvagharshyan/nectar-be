import { existsSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrationRequests, users } from '../database/schema.js';
import { createTestApp, PASSWORD, type TestApp } from '../testing/e2e.js';
import { MAX_FAILURES } from './login-attempts.js';
import { hashPassword } from './password.js';

if (existsSync('.env')) process.loadEnvFile('.env');

describe.skipIf(!process.env.DATABASE_URL)('Sign-in limits and sign-up privacy', () => {
  let t: TestApp;

  const createBroker = async (local: string) =>
    t.db.insert(users).values({
      email: t.email(local),
      passwordHash: await hashPassword(PASSWORD),
      role: 'broker',
      name: 'Spec Broker',
    });
  const pendingFor = (local: string) =>
    t.db
      .select({ id: registrationRequests.id })
      .from(registrationRequests)
      .where(eq(registrationRequests.email, t.email(local)));

  beforeAll(async () => {
    t = await createTestApp('sign-in-limits.spec.test');
    await t.cleanup();
  });

  afterAll(() => t?.close());

  it('locks an account after repeated wrong passwords, even for the right one', async () => {
    await createBroker('target');
    for (let i = 0; i < MAX_FAILURES; i++) await t.signIn('target', 'wrong-pass-1').expect(401);
    const res = await t.signIn('target').expect(429);
    expect(res.body.code).toBe('LOGIN_LOCKED');
  });

  it('counts both doors together', async () => {
    await createBroker('doors');
    for (let i = 0; i < MAX_FAILURES - 1; i++) await t.signIn('doors', 'wrong-pass-1').expect(401);
    await t.adminSignIn('doors', 'wrong-pass-1').expect(401);
    await t.signIn('doors').expect(429);
  });

  it('locks unknown emails the same way, so a lock reveals nothing', async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await t.signIn('ghost', 'wrong-pass-1').expect(401);
    expect((await t.signIn('ghost').expect(429)).body.code).toBe('LOGIN_LOCKED');
  });

  it('resets after a successful sign-in', async () => {
    await createBroker('typo');
    for (let i = 0; i < MAX_FAILURES - 1; i++) await t.signIn('typo', 'wrong-pass-1').expect(401);
    await t.signIn('typo').expect(200);
    for (let i = 0; i < MAX_FAILURES - 1; i++) await t.signIn('typo', 'wrong-pass-1').expect(401);
    await t.signIn('typo').expect(200);
  });

  it('accepts sign-up for an email that has an account without filing it', async () => {
    await createBroker('taken');
    const res = await t.signUp('taken').expect(202);
    expect(res.body).toEqual({ status: 'pending', email: t.email('taken') });
    expect(await pendingFor('taken')).toHaveLength(0);
  });

  it('accepts a duplicate pending sign-up without filing it twice', async () => {
    await t.signUp('twice').expect(202);
    const res = await t.signUp('twice', 'partner', 'other-pass-1').expect(202);
    expect(res.body).toEqual({ status: 'pending', email: t.email('twice') });
    expect(await pendingFor('twice')).toHaveLength(1);
    // The first application, and its password, stand.
    expect((await t.signIn('twice').expect(403)).body.code).toBe('REGISTRATION_PENDING');
  });
});
