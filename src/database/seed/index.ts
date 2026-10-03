import { existsSync } from 'node:fs';
import { inArray } from 'drizzle-orm';
import pg from 'pg';
import { hashPassword } from '../../auth/password.js';
import { matchScore } from '../../workspace/rules.js';
import { createDatabase, type Transaction } from '../database.module.js';
import * as t from '../schema.js';
import {
  ADMIN_USER,
  CLIENTS,
  COMPANIES,
  DEMO_PASSWORD,
  EMPLOYEES,
  PROPERTIES,
  REQUESTS,
  USERS,
  type SeedProperty,
} from './data.js';
import { configureCloudinary, uploadSeedImages } from './images.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const env = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);

const propertyTitle = ({ type, rooms, area }: SeedProperty) =>
  `${type === 'Квартира' && rooms ? `${rooms}-комн. квартира` : type} • ${area} м²`;

const employeeCompany = new Map(EMPLOYEES.map((e) => [e.id, e.companyId]));
employeeCompany.set('RF-100-E01', 'RF-100');
const propertyById = new Map(PROPERTIES.map((p) => [p.id, p]));

/** Removes everything a previous seed run created; the real accounts and their records stay. */
async function clear(tx: Transaction) {
  await tx
    .delete(t.users)
    .where(inArray(t.users.email, [...USERS.map((u) => u.email), ADMIN_USER.email]));
  await tx.delete(t.requests).where(inArray(t.requests.id, REQUESTS.map((r) => r.id)));
  await tx.delete(t.properties).where(inArray(t.properties.id, PROPERTIES.map((p) => p.id)));
  await tx.delete(t.clients).where(inArray(t.clients.id, CLIENTS.map((c) => c.id)));
  await tx.delete(t.employees).where(inArray(t.employees.id, EMPLOYEES.map((e) => e.id)));
  await tx.delete(t.companies).where(inArray(t.companies.id, COMPANIES.map((c) => c.id)));
}

async function main() {
  configureCloudinary(env('CLOUDINARY_URL'));
  console.log('Uploading photos to Cloudinary…');
  const images = await uploadSeedImages(`${env('CLOUDINARY_FOLDER', 'nectar/properties')}/seed`);

  const pool = new pg.Pool({ connectionString: env('DATABASE_URL') });
  const db = createDatabase(pool);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await db.transaction(async (tx) => {
    await clear(tx);

    await tx.insert(t.companies).values(
      COMPANIES.map((c) => ({ ...c, createdAt: daysAgo(30) })),
    );
    await tx.insert(t.employees).values(EMPLOYEES);
    await tx.insert(t.users).values(
      USERS.map((u) => {
        const employee = EMPLOYEES.find((e) => e.id === u.employeeId)!;
        return {
          email: u.email,
          passwordHash,
          role: u.role,
          name: employee.name,
          phone: employee.phone,
          avatarUrl: images.portrait[u.avatar],
          companyId: employee.companyId,
          employeeId: employee.id,
          createdAt: daysAgo(30),
        };
      }),
    );
    await tx.insert(t.users).values({
      email: ADMIN_USER.email,
      passwordHash,
      role: 'admin',
      name: ADMIN_USER.name,
      phone: ADMIN_USER.phone,
      avatarUrl: images.portrait[ADMIN_USER.avatar],
      createdAt: daysAgo(30),
    });
    await tx.insert(t.clients).values(
      CLIENTS.map((c, i) => ({
        id: c.id,
        publicId: c.id.replace(/^C-/, 'CL-'),
        companyId: employeeCompany.get(c.employeeId)!,
        employeeId: c.employeeId,
        name: c.name,
        phone: c.phone,
        email: c.email,
        createdAt: daysAgo(28 - i),
      })),
    );
    await tx.insert(t.properties).values(
      PROPERTIES.map(({ photos, daysAgo: age, privateNotes, internalAddress, ...p }) => ({
        ...p,
        title: propertyTitle({ photos, daysAgo: age, ...p }),
        privateNotes: privateNotes ?? '',
        internalAddress: internalAddress ?? '',
        media: photos.map((key) => images.photo[key]),
        createdAt: daysAgo(age),
      })),
    );

    for (const r of REQUESTS) {
      const { offers, transfer, drafts, events: _events, daysAgo: age, ...request } = r;
      await tx.insert(t.requests).values({ ...request, createdAt: daysAgo(age) });
      for (const o of offers) {
        const property = propertyById.get(o.propertyId)!;
        await tx.insert(t.offers).values({
          id: o.id,
          requestId: r.id,
          propertyId: o.propertyId,
          companyId: property.companyId,
          state: o.state,
          disposition: o.disposition ?? 'neutral',
          closeReason: o.closeReason ?? null,
          matchScore: matchScore(r, property),
          createdAt: daysAgo(o.daysAgo),
        });
      }
      if (transfer)
        await tx.insert(t.transfers).values({
          id: transfer.id,
          requestId: r.id,
          offerIds: transfer.offerIds,
          state: transfer.state,
          soldPropertyId: transfer.soldPropertyId ?? null,
          createdAt: daysAgo(transfer.daysAgo),
        });
      for (const d of drafts ?? [])
        await tx.insert(t.drafts).values({ requestId: r.id, ...d, createdAt: daysAgo(1) });
    }

    const events = REQUESTS.flatMap((r) =>
      r.events.map((e) => ({ ...e, requestId: r.id })),
    ).sort((a, b) => b.daysAgo - a.daysAgo);
    await tx.insert(t.events).values(
      events.map((e, i) => ({
        id: `EV-${i + 1}`,
        type: e.type,
        requestId: e.requestId,
        propertyId: e.propertyId ?? null,
        createdAt: daysAgo(e.daysAgo),
      })),
    );
  });

  await pool.end();
  console.log(
    `Seeded ${COMPANIES.length} companies, ${CLIENTS.length} clients, ${PROPERTIES.length} properties, ${REQUESTS.length} requests.`,
  );
  console.log(`Demo logins (password "${DEMO_PASSWORD}"): ${[...USERS.map((u) => u.email), ADMIN_USER.email].join(', ')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
