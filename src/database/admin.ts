/**
 * Creates an admin account. Admins never sign up through the app.
 *
 *   npm run admin:create                       # uses ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD
 *   npm run admin:create -- --email admin@example.com --name "Имя"
 *
 * Flags override ADMIN_EMAIL / ADMIN_NAME. The password comes from
 * ADMIN_PASSWORD, or a hidden prompt when it is unset. Re-running with an
 * existing email is a no-op, so it is safe to run on every deploy.
 */
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { hashPassword } from '../auth/password.js';
import { createDatabase } from './database.module.js';
import { isUniqueViolation } from './errors.js';
import { users } from './schema.js';

if (existsSync('.env')) process.loadEnvFile('.env');

// Same rules as sign-up (see src/auth/dto.ts).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** Reads a line without echoing it to the terminal. */
function promptHidden(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })
    ._writeToOutput;
  let muted = false;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (
    s,
  ) => {
    if (!muted) write.call(rl, s);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY)
    fail('Set ADMIN_PASSWORD when stdin is not a terminal.');
  const password = await promptHidden('Password: ');
  const repeat = await promptHidden('Repeat password: ');
  if (password !== repeat) fail('Passwords do not match.');
  return password;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
    },
  });
  const email = (values.email ?? process.env.ADMIN_EMAIL ?? '')
    .trim()
    .toLowerCase();
  const name = (values.name ?? process.env.ADMIN_NAME ?? '').trim();
  if (!EMAIL.test(email)) fail('Set ADMIN_EMAIL or pass a valid --email.');
  if (name.length < 2 || name.length > 120)
    fail('Set ADMIN_NAME or pass --name with 2 to 120 characters.');

  const password = await readPassword();
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD)
    fail(`Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`);

  const url = process.env.DATABASE_URL ?? fail('DATABASE_URL is not set');
  const pool = new pg.Pool({ connectionString: url });
  try {
    const [admin] = await createDatabase(pool)
      .insert(users)
      .values({
        email,
        name,
        role: 'admin',
        passwordHash: await hashPassword(password),
      })
      .returning({ id: users.id });
    console.log(`Created admin ${email} (${admin.id}).`);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    console.log(`A user with email ${email} already exists; skipping.`);
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
