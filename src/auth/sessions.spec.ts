import { existsSync } from 'node:fs';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../database/schema.js';
import { createTestApp, PASSWORD, type TestApp } from '../testing/e2e.js';
import { hashPassword } from './password.js';
import { SESSION_COOKIE } from './session-cookie.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const HOUR = 3600;
const DAY = 24 * HOUR;

/** Pulls the JWT out of a `Set-Cookie` header. */
const tokenOf = (cookie: string[]) =>
  cookie
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))!
    .split(';')[0]
    .slice(SESSION_COOKIE.length + 1);

const claimsOf = (cookie: string[]) =>
  JSON.parse(Buffer.from(tokenOf(cookie).split('.')[1], 'base64url').toString()) as {
    sub: string;
    sv: number;
    aud: string;
    iat: number;
    exp: number;
  };

const asCookie = (token: string) => [`${SESSION_COOKIE}=${token}`];

describe.skipIf(!process.env.DATABASE_URL)('Sessions', () => {
  let t: TestApp;
  let brokerId: string;
  let jwt: JwtService;

  const me = (cookie: string[]) => request(t.http).get('/api/auth/me').set('Cookie', cookie);
  const changePassword = (cookie: string[], currentPassword: string, newPassword: string) =>
    request(t.http)
      .post('/api/auth/password')
      .set('Cookie', cookie)
      .send({ currentPassword, newPassword });

  beforeAll(async () => {
    t = await createTestApp('sessions.spec.test');
    await t.cleanup();
    await t.createAdmin();
    const [broker] = await t.db
      .insert(users)
      .values({
        email: t.email('broker'),
        passwordHash: await hashPassword(PASSWORD),
        role: 'broker',
        name: 'Spec Broker',
      })
      .returning({ id: users.id });
    brokerId = broker.id;
    jwt = new JwtService({ secret: process.env.JWT_SECRET });
  });

  afterAll(() => t?.close());

  it('issues short admin sessions and long cabinet sessions with their own audience', async () => {
    const admin = claimsOf(await t.adminSession());
    expect(admin).toMatchObject({ aud: 'admin', sv: 0 });
    expect(admin.exp - admin.iat).toBe(12 * HOUR);
    expect(admin).not.toHaveProperty('role');

    const broker = claimsOf(await t.session('broker'));
    expect(broker).toMatchObject({ aud: 'cabinet', sub: brokerId });
    expect(broker.exp - broker.iat).toBe(7 * DAY);
  });

  it('rejects a token from the wrong door', async () => {
    const { sv } = claimsOf(await t.session('broker'));
    const forged = jwt.sign({ sub: brokerId, sv }, { audience: 'admin' });
    await me(asCookie(forged)).expect(401);
  });

  it('rejects tokens without a session version, e.g. ones issued before it existed', async () => {
    const legacy = jwt.sign({ sub: brokerId, role: 'broker', companyId: null });
    await me(asCookie(legacy)).expect(401);
  });

  it('accepts only HS256', async () => {
    const { sv } = claimsOf(await t.session('broker'));
    const token = jwt.sign({ sub: brokerId, sv }, { audience: 'cabinet', algorithm: 'HS512' });
    await me(asCookie(token)).expect(401);
  });

  it('ends a cabinet session when the account is promoted to admin', async () => {
    const cookie = await t.session('broker');
    await me(cookie).expect(200);
    await t.db.update(users).set({ role: 'admin' }).where(eq(users.id, brokerId));
    try {
      await me(cookie).expect(401);
      // The admin door works, and its session does.
      await me(await t.adminSession('broker')).expect(200);
    } finally {
      await t.db.update(users).set({ role: 'broker' }).where(eq(users.id, brokerId));
    }
  });

  it('signs out other devices on password change but keeps the current one', async () => {
    const laptop = await t.session('broker');
    const phone = await t.session('broker');

    const res = await changePassword(laptop, PASSWORD, 'new-password-1').expect(204);
    const renewed = res.get('Set-Cookie') ?? [];
    expect(claimsOf(renewed).sv).toBe(claimsOf(laptop).sv + 1);

    await me(phone).expect(401);
    await me(laptop).expect(401);
    await me(renewed).expect(200);
    await t.signIn('broker').expect(401);

    // Put the password back for any later test.
    await changePassword(renewed, 'new-password-1', PASSWORD).expect(204);
  });

  it('leaves sessions alone when the password change fails', async () => {
    const cookie = await t.session('broker');
    await changePassword(cookie, 'wrong-password', 'new-password-2').expect(400);
    await me(cookie).expect(200);
  });
});
