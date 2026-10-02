import { sql } from 'drizzle-orm';
import type { PgSequence } from 'drizzle-orm/pg-core';
import type { DbExecutor } from './database.module.js';

/** Builds a human-readable id such as `OF-1001` from a Postgres sequence. */
export async function nextId(
  db: DbExecutor,
  prefix: string,
  sequence: PgSequence,
): Promise<string> {
  const name = sequence.seqName ?? '';
  const result = await db.execute<{ value: string }>(
    sql`select nextval(${name}) as value`,
  );
  return `${prefix}-${result.rows[0].value}`;
}
