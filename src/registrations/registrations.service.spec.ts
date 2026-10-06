import { existsSync } from 'node:fs';
import { and, count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  companies,
  employees,
  registrationRequests,
  users,
} from '../database/schema.js';
import { createTestApp, type TestApp } from '../testing/e2e.js';

if (existsSync('.env')) process.loadEnvFile('.env');

describe.skipIf(!process.env.DATABASE_URL)('Sign-up approval', () => {
  let t: TestApp;
  let admin: string[];

  const pendingId = async (local: string) => {
    const [row] = await t.db
      .select({ id: registrationRequests.id })
      .from(registrationRequests)
      .where(
        and(
          eq(registrationRequests.email, t.email(local)),
          eq(registrationRequests.status, 'pending'),
        ),
      );
    return row.id;
  };
  const approve = (id: string) =>
    request(t.http).post(`/api/registration-requests/${id}/approve`).set('Cookie', admin);
  const reject = (id: string, reason?: string) =>
    request(t.http)
      .post(`/api/registration-requests/${id}/reject`)
      .set('Cookie', admin)
      .send({ reason });

  beforeAll(async () => {
    t = await createTestApp('registrations.spec.test');
    await t.cleanup();
    await t.createAdmin();
    admin = await t.session('admin');
  });

  afterAll(() => t?.close());

  it('files a pending request without creating an account or a cookie', async () => {
    const res = await t.signUp('new').expect(202);
    expect(res.body).toEqual({ status: 'pending', email: t.email('new') });
    expect(res.get('Set-Cookie')).toBeUndefined();

    const rows = await t.db
      .select()
      .from(registrationRequests)
      .where(eq(registrationRequests.email, t.email('new')));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].passwordHash).toMatch(/^scrypt\$/);
    const account = await t.db
      .select()
      .from(users)
      .where(eq(users.email, t.email('new')));
    expect(account).toHaveLength(0);
    const company = await t.db
      .select()
      .from(companies)
      .where(eq(companies.contact, t.email('new')));
    expect(company).toHaveLength(0);
  });

  it('refuses a second request while one is pending, and allows one after rejection', async () => {
    await t.signUp('again').expect(202);
    const dup = await t.signUp('again', 'partner').expect(409);
    expect(dup.body.message).toBe('Заявка с этим email уже на рассмотрении');

    await reject(await pendingId('again'), 'Неполные данные').expect(200);
    await t.signUp('again').expect(202);
  });

  it('refuses sign-up with the email of an existing account', async () => {
    const res = await t.signUp('admin').expect(409);
    expect(res.body.message).toBe('Пользователь с таким email уже существует');
  });

  it('refuses the admin role and a missing company name', async () => {
    await request(t.http)
      .post('/api/auth/sign-up')
      .send({
        role: 'admin',
        name: 'Hacker',
        email: t.email('hacker'),
        password: 'password123',
        companyName: 'Evil',
      })
      .expect(400);
    await request(t.http)
      .post('/api/auth/sign-up')
      .send({
        role: 'broker',
        name: 'No Company',
        email: t.email('nocompany'),
        password: 'password123',
        companyName: ' ',
      })
      .expect(400);
  });

  it('reports a pending request at sign-in only for the right password', async () => {
    await t.signUp('waiting').expect(202);
    const pending = await t.signIn('waiting').expect(403);
    expect(pending.body.code).toBe('REGISTRATION_PENDING');

    const wrong = await t.signIn('waiting', 'wrongpass1').expect(401);
    expect(wrong.body.code).toBeUndefined();
    expect(wrong.body.message).toBe('Неверный email или пароль');
  });

  it.each([
    ['broker', 'rf', /^RF-\d+$/],
    ['partner', 'am', /^AM-\d+$/],
  ] as const)(
    'approving a %s creates the company, owner employee and account',
    async (role, kind, idPattern) => {
      const local = `approved-${role}`;
      await t.signUp(local, role).expect(202);
      const id = await pendingId(local);

      const res = await approve(id).expect(200);
      expect(res.body).toEqual({
        ok: true,
        userId: expect.any(String),
        companyId: expect.stringMatching(idPattern),
      });
      const { userId, companyId } = res.body as { userId: string; companyId: string };

      const [company] = await t.db.select().from(companies).where(eq(companies.id, companyId));
      expect(company).toMatchObject({ kind, name: `Company ${local}`, contact: t.email(local) });
      const [employee] = await t.db
        .select()
        .from(employees)
        .where(eq(employees.companyId, companyId));
      expect(employee).toMatchObject({ id: `${companyId}-E01`, name: `Applicant ${local}` });
      const [user] = await t.db.select().from(users).where(eq(users.id, userId));
      expect(user).toMatchObject({
        email: t.email(local),
        role,
        companyId,
        employeeId: `${companyId}-E01`,
      });
      const [reg] = await t.db
        .select()
        .from(registrationRequests)
        .where(eq(registrationRequests.id, id));
      expect(reg).toMatchObject({ status: 'approved', userId, companyId });
      expect(reg.reviewedAt).toBeInstanceOf(Date);

      // The password chosen at sign-up works after approval.
      const signIn = await t.signIn(local).expect(200);
      expect(signIn.body.user).toMatchObject({ role, companyId });
    },
  );

  it('refuses to review a request twice', async () => {
    await t.signUp('twice').expect(202);
    const id = await pendingId('twice');
    await approve(id).expect(200);
    expect((await approve(id).expect(409)).body.message).toBe('Заявка уже обработана');
    await reject(id, 'Слишком поздно').expect(409);
  });

  it('serializes concurrent approvals of the same request', async () => {
    await t.signUp('race').expect(202);
    const id = await pendingId('race');
    const results = await Promise.all([approve(id), approve(id), approve(id)]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409, 409]);
  });

  it('shows the rejection message at sign-in and requires one', async () => {
    await t.signUp('rejected').expect(202);
    const id = await pendingId('rejected');
    await reject(id).expect(400);
    await reject(id, '   ab  ').expect(400);
    await reject(id, '  Не указан ИНН компании  ').expect(200);

    const res = await t.signIn('rejected').expect(403);
    expect(res.body).toMatchObject({
      code: 'REGISTRATION_REJECTED',
      reason: 'Не указан ИНН компании',
    });
  });

  it('lists requests by status with counts and never exposes the password hash', async () => {
    await t.signUp('listed', 'partner').expect(202);
    const res = await request(t.http)
      .get('/api/registration-requests')
      .query({ search: t.email('listed'), role: 'partner' })
      .set('Cookie', admin)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.counts).toEqual({ pending: 1, approved: 0, rejected: 0 });
    const [item] = res.body.items as Record<string, unknown>[];
    expect(item).toMatchObject({ status: 'pending', role: 'partner', reviewedByName: null });
    expect(item).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('scrypt$');

    const detail = await request(t.http)
      .get(`/api/registration-requests/${item.id as string}`)
      .set('Cookie', admin)
      .expect(200);
    expect(detail.body).not.toHaveProperty('passwordHash');

    const approved = await request(t.http)
      .get('/api/registration-requests')
      .query({ status: 'approved', search: 'approved-broker' })
      .set('Cookie', admin)
      .expect(200);
    expect(approved.body.items[0]).toMatchObject({ reviewedByName: 'Spec Admin' });
  });

  it('pages through requests with a cursor', async () => {
    for (const n of [1, 2, 3]) await t.signUp(`page-${n}`).expect(202);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await request(t.http)
        .get('/api/registration-requests')
        .query({ search: 'page-', limit: 2, ...(cursor && { cursor }) })
        .set('Cookie', admin)
        .expect(200);
      seen.push(...(res.body.items as { email: string }[]).map((i) => i.email));
      cursor = res.body.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(['page-3', 'page-2', 'page-1'].map(t.email));
  });

  it('is admin-only', async () => {
    const broker = await t.session('approved-broker');
    await request(t.http).get('/api/registration-requests').set('Cookie', broker).expect(403);
    await request(t.http).get('/api/registration-requests').expect(401);
  });

  it('counts pending requests in bootstrap for admins only', async () => {
    const [{ pending }] = await t.db
      .select({ pending: count() })
      .from(registrationRequests)
      .where(eq(registrationRequests.status, 'pending'));
    const forAdmin = await request(t.http).get('/api/bootstrap').set('Cookie', admin).expect(200);
    expect(forAdmin.body.pendingRegistrations).toBe(pending);
    expect(pending).toBeGreaterThan(0);

    const broker = await t.session('approved-broker');
    const forBroker = await request(t.http).get('/api/bootstrap').set('Cookie', broker).expect(200);
    expect(forBroker.body.pendingRegistrations).toBe(0);
  });
});
