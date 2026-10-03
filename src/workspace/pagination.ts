import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export class CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;
}

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OffsetPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

interface CursorKey {
  at: string;
  id: string;
}

const encodeCursor = ({ at, id }: CursorKey) =>
  Buffer.from(JSON.stringify([at, id])).toString('base64url');

function decodeCursor(cursor: string): CursorKey {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      !Number.isNaN(Date.parse(value[0]))
    )
      return { at: value[0], id: value[1] };
  } catch {
    // Falls through to the error below.
  }
  throw new BadRequestException('Некорректный курсор');
}

/** Exact text form of a timestamptz, so the cursor keeps microsecond precision. */
export const cursorAt = (createdAt: AnyColumn) =>
  sql<string>`${createdAt}::text`;

/** Keyset condition for lists ordered by `(created_at desc, id desc)`. */
export function afterCursor(
  createdAt: AnyColumn,
  id: AnyColumn,
  cursor?: string,
): SQL | undefined {
  if (!cursor) return undefined;
  const key = decodeCursor(cursor);
  return sql`(${createdAt}, ${id}) < (${key.at}::timestamptz, ${key.id})`;
}

/** Rows must be fetched with `limit + 1` to know whether another page exists. */
export function toCursorPage<T extends { id: string }>(
  rows: { row: T; cursorAt: string }[],
  limit: number,
): CursorPage<T> {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => r.row),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ at: last.cursorAt, id: last.row.id })
        : null,
  };
}

export const pageOffset = ({ page, limit }: PageQueryDto) => (page - 1) * limit;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Case-insensitive substring match over the given text expressions. */
export function searchSql(search: string | undefined, ...parts: SQL[]) {
  const query = search?.trim();
  if (!query) return undefined;
  return sql`concat_ws(' ', ${sql.join(parts, sql`, `)}) ilike ${`%${escapeLike(query)}%`}`;
}
