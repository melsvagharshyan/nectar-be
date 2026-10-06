import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../auth/auth.types.js';
import { DB, type Database } from '../database/database.module.js';
import { companies, users } from '../database/schema.js';
import type { BlockUserDto } from './users.dto.js';
import type { AccountView } from './users.types.js';

const blocker = alias(users, 'blocker');

// Admin accounts are managed from the CLI, not the UI.
const BLOCKABLE_ROLES = ['broker', 'partner'] as const;

/** Admin control over broker and partner accounts. */
@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async companyAccounts(companyId: string): Promise<AccountView[]> {
    const [company] = await this.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId));
    if (!company) throw new NotFoundException('Компания не найдена');
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
        blockedAt: users.blockedAt,
        blockReason: users.blockReason,
        blockedByName: blocker.name,
      })
      .from(users)
      .leftJoin(blocker, eq(blocker.id, users.blockedBy))
      .where(eq(users.companyId, companyId))
      .orderBy(asc(users.createdAt), asc(users.id));
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      blockedAt: r.blockedAt?.toISOString() ?? null,
    }));
  }

  async block(admin: AuthUser, userId: string, dto: BlockUserDto) {
    if (userId === admin.id)
      throw new BadRequestException('Нельзя заблокировать себя');
    // A single conditional update is atomic, so concurrent admins can't both win.
    const [updated] = await this.db
      .update(users)
      // Bumping the version kills existing sessions for good, so unblocking
      // needs a fresh sign-in instead of reviving a possibly stolen token.
      .set({
        blockedAt: new Date(),
        blockedBy: admin.id,
        blockReason: dto.reason,
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(
        and(
          eq(users.id, userId),
          inArray(users.role, BLOCKABLE_ROLES),
          isNull(users.blockedAt),
        ),
      )
      .returning({ id: users.id });
    if (!updated) await this.explainMiss(userId, 'Пользователь уже заблокирован');
    return { ok: true as const };
  }

  async unblock(userId: string) {
    const [updated] = await this.db
      .update(users)
      .set({ blockedAt: null, blockedBy: null, blockReason: null })
      .where(
        and(
          eq(users.id, userId),
          inArray(users.role, BLOCKABLE_ROLES),
          isNotNull(users.blockedAt),
        ),
      )
      .returning({ id: users.id });
    if (!updated) await this.explainMiss(userId, 'Пользователь не заблокирован');
    return { ok: true as const };
  }

  /** Turns a no-op update into the right error for the caller. */
  private async explainMiss(userId: string, stateMessage: string): Promise<never> {
    const [user] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.role === 'admin')
      throw new BadRequestException('Аккаунты администраторов управляются отдельно');
    throw new ConflictException(stateMessage);
  }
}
