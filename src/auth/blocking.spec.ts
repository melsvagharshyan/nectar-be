import { existsSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrationRequests } from '../database/schema.js';
import { createTestApp, type TestApp } from '../testing/e2e.js';

if (existsSync('.env')) process.loadEnvFile('.env');

describe.skipIf(!process.env.DATABASE_URL)('Account blocking', () => {
  let t: TestApp;
  let admin: string[];
  let adminId: string;
  let broker: { id: string; companyId: string };
  // A session started before the block; it should work again after unblock.
  let oldSession: string[];

  const block = (id: string, reason?: string, cookie = admin) =>
    request(t.http).post(`/api/users/${id}/block`).set('Cookie', cookie).send({ reason });
  const unblock = (id: string) =>
    request(t.http).post(`/api/users/${id}/unblock`).set('Cookie', admin);
  const me = (cookie: string[]) => request(t.http).get('/api/auth/me').set('Cookie', cookie);

  beforeAll(async () => {
    t = await createTestApp('blocking.spec.test');
    await t.cleanup();
    adminId = await t.createAdmin();
    admin = await t.session('admin');

    // A broker created the normal way: sign-up, then approval.
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
    const res = await request(t.http)
      .post(`/api/registration-requests/${reg.id}/approve`)
      .set('Cookie', admin)
      .expect(200);
    broker = { id: res.body.userId, companyId: res.body.companyId };
  });

  afterAll(() => t?.close());

  it('cuts off an existing session on its next request', async () => {
    oldSession = await t.session('broker');
    await me(oldSession).expect(200);

    await block(broker.id, '  Жалобы клиентов  ').expect(200);

    const res = await me(oldSession).expect(401);
    expect(res.body).toMatchObject({ code: 'ACCOUNT_BLOCKED' });
    await request(t.http).get('/api/bootstrap').set('Cookie', oldSession).expect(401);
  });

  it('refuses sign-in with the reason, but only for the right password', async () => {
    const res = await t.signIn('broker').expect(403);
    expect(res.body).toMatchObject({ code: 'ACCOUNT_BLOCKED', reason: 'Жалобы клиентов' });

    const wrong = await t.signIn('broker', 'wrongpass1').expect(401);
    expect(wrong.body.code).toBeUndefined();
  });

  it('cannot be bypassed by signing up again', async () => {
    await t.signUp('broker').expect(409);
  });

  it('refuses blocking twice', async () => {
    const res = await block(broker.id, 'Ещё раз').expect(409);
    expect(res.body.message).toBe('Пользователь уже заблокирован');
  });

  it('restores access on unblock, including the old session', async () => {
    await unblock(broker.id).expect(200);
    await unblock(broker.id).expect(409);
    await me(oldSession).expect(200);
    await t.signIn('broker').expect(200);
  });

  it('serializes concurrent blocks', async () => {
    const results = await Promise.all([
      block(broker.id, 'Гонка 1'),
      block(broker.id, 'Гонка 2'),
      block(broker.id, 'Гонка 3'),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409, 409]);
    await unblock(broker.id).expect(200);
  });

  it('refuses to block yourself, another admin or a missing user', async () => {
    expect((await block(adminId, 'Сам себя').expect(400)).body.message).toBe(
      'Нельзя заблокировать себя',
    );
    const otherAdmin = await t.createAdmin('other-admin');
    await block(otherAdmin, 'Другой админ').expect(400);
    await block('00000000-0000-4000-8000-000000000000', 'Никого нет').expect(404);
    await block('not-a-uuid', 'Плохой id').expect(400);
  });

  it('requires a reason of at least 3 characters', async () => {
    await block(broker.id).expect(400);
    await block(broker.id, '  ab ').expect(400);
  });

  it('is admin-only', async () => {
    const cookie = await t.session('broker');
    await block(adminId, 'Бунт', cookie).expect(403);
    await request(t.http)
      .get(`/api/companies/${broker.companyId}/accounts`)
      .set('Cookie', cookie)
      .expect(403);
  });

  it('lists company accounts with block details and no password hash', async () => {
    await block(broker.id, 'Проверка списка').expect(200);
    const res = await request(t.http)
      .get(`/api/companies/${broker.companyId}/accounts`)
      .set('Cookie', admin)
      .expect(200);
    expect(res.body).toEqual([
      {
        id: broker.id,
        email: t.email('broker'),
        name: 'Applicant broker',
        role: 'broker',
        createdAt: expect.any(String),
        blockedAt: expect.any(String),
        blockReason: 'Проверка списка',
        blockedByName: 'Spec Admin',
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('scrypt$');

    // The approved request shows the account state too.
    const regs = await request(t.http)
      .get('/api/registration-requests')
      .query({ status: 'approved', search: t.email('broker') })
      .set('Cookie', admin)
      .expect(200);
    expect(regs.body.items[0]).toMatchObject({ userBlockReason: 'Проверка списка' });

    await request(t.http).get('/api/companies/XX-0/accounts').set('Cookie', admin).expect(404);
  });
});
