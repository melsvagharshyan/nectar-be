import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { inArray, like, or } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { hashPassword } from '../auth/password.js';
import { DB, type Database } from '../database/database.module.js';
import { companies, registrationRequests, users } from '../database/schema.js';

export const PASSWORD = 'password123';

/**
 * The real app over HTTP, with rate limits off so specs can sign in freely.
 * Each spec uses its own email `domain` and removes its rows in `close()`.
 */
export async function createTestApp(domain: string) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestExpressApplication>(),
  );
  await app.init();
  const db = app.get<Database>(DB);
  const http = app.getHttpServer();
  const email = (local: string) => `${local}@${domain}`;

  const cleanup = async () => {
    const pattern = `%@${domain}`;
    await db.transaction(async (tx) => {
      const created = await tx
        .select({ companyId: registrationRequests.companyId })
        .from(registrationRequests)
        .where(like(registrationRequests.email, pattern));
      const companyIds = created.flatMap((c) => (c.companyId ? [c.companyId] : []));
      await tx
        .delete(registrationRequests)
        .where(like(registrationRequests.email, pattern));
      await tx.delete(users).where(
        or(
          like(users.email, pattern),
          companyIds.length ? inArray(users.companyId, companyIds) : undefined,
        ),
      );
      if (companyIds.length)
        await tx.delete(companies).where(inArray(companies.id, companyIds));
    });
  };

  return {
    http,
    db,
    email,
    /** Leftovers from an aborted run would break uniqueness checks. */
    cleanup,
    async close() {
      await cleanup();
      await app.close();
    },
    async createAdmin(local = 'admin') {
      const [admin] = await db
        .insert(users)
        .values({
          email: email(local),
          passwordHash: await hashPassword(PASSWORD),
          role: 'admin',
          name: 'Spec Admin',
        })
        .returning({ id: users.id });
      return admin.id;
    },
    signUp(local: string, role: 'broker' | 'partner' = 'broker', password = PASSWORD) {
      return request(http)
        .post('/api/auth/sign-up')
        .send({
          role,
          name: `Applicant ${local}`,
          email: email(local),
          password,
          phone: '+7 900 000-00-00',
          companyName: `Company ${local}`,
        });
    },
    signIn(local: string, password = PASSWORD) {
      return request(http)
        .post('/api/auth/sign-in')
        .send({ email: email(local), password });
    },
    /** Signs in and returns the session cookie for later requests. */
    async session(local: string, password = PASSWORD) {
      const res = await this.signIn(local, password).expect(200);
      return res.get('Set-Cookie') ?? [];
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
