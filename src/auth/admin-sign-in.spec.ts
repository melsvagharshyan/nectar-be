import { existsSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrationRequests } from '../database/schema.js';
import { createTestApp, PASSWORD, type TestApp } from '../testing/e2e.js';

if (existsSync('.env')) process.loadEnvFile('.env');

describe.skipIf(!process.env.DATABASE_URL)('Admin sign-in', () => {
  let t: TestApp;

  const adminSignIn = (local: string, password = PASSWORD) =>
    request(t.http)
      .post('/api/auth/admin/sign-in')
      .send({ email: t.email(local), password });

  beforeAll(async () => {
    t = await createTestApp('admin-sign-in.spec.test');
    await t.cleanup();
    await t.createAdmin();
    const admin = await t.session('admin');

    await t.signUp('broker').expect(202);
    const [reg] = await t.db
      .select({ id: registrationRequests.id })
      .from(registrationRequests)
      .where(
        and(
          eq(registrationRequests.email, t.email('broker')),
          eq(registrationRequests.status, 'pending'),
        ),
      );
    await request(t.http)
      .post(`/api/registration-requests/${reg.id}/approve`)
      .set('Cookie', admin)
      .expect(200);
  });

  afterAll(() => t?.close());

  it('starts a session for an admin', async () => {
    const res = await adminSignIn('admin').expect(200);
    expect(res.body.user).toMatchObject({ email: t.email('admin'), role: 'admin' });
    const cookie = res.get('Set-Cookie') ?? [];
    expect(cookie.length).toBeGreaterThan(0);
    await request(t.http).get('/api/auth/me').set('Cookie', cookie).expect(200);
  });

  it('refuses non-admins exactly like a wrong password', async () => {
    const broker = await adminSignIn('broker').expect(401);
    const wrong = await adminSignIn('admin', 'wrongpass1').expect(401);
    const missing = await adminSignIn('nobody').expect(401);
    expect(broker.body).toEqual(wrong.body);
    expect(missing.body).toEqual(wrong.body);
    expect(broker.get('Set-Cookie')).toBeUndefined();
  });
});
