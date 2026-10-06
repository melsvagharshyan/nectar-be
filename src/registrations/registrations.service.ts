import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../auth/auth.types.js';
import { COMPANY_KIND, COMPANY_PREFIX } from '../database/companies.js';
import { DB, type Database } from '../database/database.module.js';
import { isUniqueViolation } from '../database/errors.js';
import { nextId } from '../database/ids.js';
import {
  companies,
  companyIdSeq,
  employees,
  registrationRequests as r,
  users,
} from '../database/schema.js';
import {
  afterCursor,
  cursorAt,
  searchSql,
  toCursorPage,
} from '../workspace/pagination.js';
import type {
  RegistrationsQueryDto,
  RejectRegistrationDto,
} from './registrations.dto.js';
import type {
  ApproveResult,
  RegistrationsPage,
  RegistrationView,
} from './registrations.types.js';

const reviewer = alias(users, 'reviewer');
const account = alias(users, 'account');

const iso = (date: Date | null) => date?.toISOString() ?? null;

type Row = Awaited<ReturnType<RegistrationsService['query']>>[number];

function toRow({ cursorAt, reviewedAt, userBlockedAt, createdAt, role, ...rest }: Row) {
  const row: RegistrationView = {
    ...rest,
    // The table's CHECK constraint rules out 'admin'.
    role: role as RegistrationView['role'],
    reviewedAt: iso(reviewedAt),
    userBlockedAt: iso(userBlockedAt),
    createdAt: createdAt.toISOString(),
  };
  return { row, cursorAt };
}

/** Admin review of self-service sign-ups. */
@Injectable()
export class RegistrationsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(q: RegistrationsQueryDto): Promise<RegistrationsPage> {
    const filters = and(
      q.role ? eq(r.role, q.role) : undefined,
      searchSql(q.search, sql`${r.name}`, sql`${r.email}`, sql`${r.companyName}`),
    );
    const [rows, statuses] = await Promise.all([
      this.query(
        and(filters, eq(r.status, q.status), afterCursor(r.createdAt, r.id, q.cursor)),
      ).limit(q.limit + 1),
      this.db
        .select({ status: r.status, total: count() })
        .from(r)
        .where(filters)
        .groupBy(r.status),
    ]);
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const s of statuses) counts[s.status] = s.total;
    return { ...toCursorPage(rows.map(toRow), q.limit), counts };
  }

  async detail(id: string): Promise<RegistrationView> {
    const [row] = await this.query(eq(r.id, id));
    if (!row) throw new NotFoundException('Заявка не найдена');
    return toRow(row).row;
  }

  /** Creates the company, its owner employee `E01` and the account. */
  approve(admin: AuthUser, id: string): Promise<ApproveResult> {
    return this.db.transaction(async (tx) => {
      // The row lock serializes admins reviewing the same request.
      const [reg] = await tx.select().from(r).where(eq(r.id, id)).for('update');
      if (!reg) throw new NotFoundException('Заявка не найдена');
      if (reg.status !== 'pending')
        throw new ConflictException('Заявка уже обработана');

      const kind = COMPANY_KIND[reg.role as keyof typeof COMPANY_KIND];
      const companyId = await nextId(tx, COMPANY_PREFIX[kind], companyIdSeq);
      const employeeId = `${companyId}-E01`;
      await tx
        .insert(companies)
        .values({ id: companyId, kind, name: reg.companyName, contact: reg.email });
      await tx
        .insert(employees)
        .values({ id: employeeId, companyId, name: reg.name, phone: reg.phone });
      let userId: string;
      try {
        const [user] = await tx
          .insert(users)
          .values({
            email: reg.email,
            // Hashed at sign-up, so the applicant keeps the password they chose.
            passwordHash: reg.passwordHash,
            role: reg.role,
            name: reg.name,
            phone: reg.phone,
            companyId,
            employeeId,
          })
          .returning({ id: users.id });
        userId = user.id;
      } catch (e) {
        if (isUniqueViolation(e))
          throw new ConflictException('Пользователь с таким email уже существует');
        throw e;
      }

      await tx
        .update(r)
        .set({
          status: 'approved',
          reviewedBy: admin.id,
          reviewedAt: new Date(),
          userId,
          companyId,
        })
        .where(eq(r.id, id));
      return { ok: true as const, userId, companyId };
    });
  }

  reject(admin: AuthUser, id: string, dto: RejectRegistrationDto) {
    return this.db.transaction(async (tx) => {
      const [reg] = await tx
        .select({ status: r.status })
        .from(r)
        .where(eq(r.id, id))
        .for('update');
      if (!reg) throw new NotFoundException('Заявка не найдена');
      if (reg.status !== 'pending')
        throw new ConflictException('Заявка уже обработана');
      await tx
        .update(r)
        .set({
          status: 'rejected',
          rejectReason: dto.reason,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        })
        .where(eq(r.id, id));
      return { ok: true as const };
    });
  }

  /** Newest first; the password hash is never selected. */
  private query(where: SQL | undefined) {
    return this.db
      .select({
        id: r.id,
        role: r.role,
        status: r.status,
        email: r.email,
        name: r.name,
        phone: r.phone,
        companyName: r.companyName,
        rejectReason: r.rejectReason,
        reviewedAt: r.reviewedAt,
        reviewedByName: reviewer.name,
        userId: r.userId,
        companyId: r.companyId,
        userBlockedAt: account.blockedAt,
        userBlockReason: account.blockReason,
        createdAt: r.createdAt,
        cursorAt: cursorAt(r.createdAt),
      })
      .from(r)
      .leftJoin(reviewer, eq(reviewer.id, r.reviewedBy))
      .leftJoin(account, eq(account.id, r.userId))
      .where(where)
      .orderBy(desc(r.createdAt), desc(r.id))
      .$dynamic();
  }
}
