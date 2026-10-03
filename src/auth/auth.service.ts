import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import { nextId } from '../database/ids.js';
import { companies, companyIdSeq, employees, users } from '../database/schema.js';
import type { IssuedSession, JwtPayload, UserDto } from './auth.types.js';
import type {
  ChangePasswordDto,
  SignInDto,
  SignUpDto,
  UpdateProfileDto,
} from './dto.js';
import { hashPassword, verifyPassword } from './password.js';

const COMPANY_KIND = { broker: 'rf', partner: 'am' } as const;
const COMPANY_PREFIX = { broker: 'RF', partner: 'AM' } as const;

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signUp(dto: SignUpDto): Promise<IssuedSession> {
    if (
      dto.role === 'admin' &&
      !safeEqual(dto.adminCode ?? '', this.config.get('ADMIN_SIGNUP_CODE'))
    )
      throw new ForbiddenException('Неверный код администратора');

    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email));
    if (existing)
      throw new ConflictException('Пользователь с таким email уже существует');

    const passwordHash = await hashPassword(dto.password);
    const phone = dto.phone ?? '';

    const userId = await this.db.transaction(async (tx) => {
      let companyId: string | null = null;
      let employeeId: string | null = null;
      if (dto.role !== 'admin') {
        companyId = await nextId(tx, COMPANY_PREFIX[dto.role], companyIdSeq);
        employeeId = `${companyId}-E01`;
        await tx.insert(companies).values({
          id: companyId,
          kind: COMPANY_KIND[dto.role],
          name: dto.companyName!,
          contact: dto.email,
        });
        await tx
          .insert(employees)
          .values({ id: employeeId, companyId, name: dto.name, phone });
      }
      const [user] = await tx
        .insert(users)
        .values({
          email: dto.email,
          passwordHash,
          role: dto.role,
          name: dto.name,
          phone,
          companyId,
          employeeId,
        })
        .returning({ id: users.id });
      return user.id;
    });

    return this.issue(await this.getUser(userId));
  }

  async signIn(dto: SignInDto): Promise<IssuedSession> {
    const [user] = await this.db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, dto.email));
    if (!user || !(await verifyPassword(dto.password, user.passwordHash)))
      throw new UnauthorizedException('Неверный email или пароль');
    return this.issue(await this.getUser(user.id));
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDto> {
    const changes = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
    };
    if (Object.keys(changes).length > 0)
      await this.db.transaction(async (tx) => {
        const [user] = await tx
          .update(users)
          .set(changes)
          .where(eq(users.id, id))
          .returning({ employeeId: users.employeeId });
        if (!user) throw new NotFoundException('Пользователь не найден');
        // The account owner is also listed in the company directory.
        const { name, phone } = changes;
        if (user.employeeId && (name !== undefined || phone !== undefined))
          await tx
            .update(employees)
            .set({ ...(name !== undefined && { name }), ...(phone !== undefined && { phone }) })
            .where(eq(employees.id, user.employeeId));
      });
    return this.getUser(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const [user] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, id));
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash)))
      throw new BadRequestException('Текущий пароль указан неверно');
    if (dto.currentPassword === dto.newPassword)
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(dto.newPassword) })
      .where(eq(users.id, id));
  }

  async getUser(id: string): Promise<UserDto> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        role: users.role,
        companyId: users.companyId,
        companyName: companies.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(companies, eq(companies.id, users.companyId))
      .where(eq(users.id, id));
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  private async issue(user: UserDto): Promise<IssuedSession> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      companyId: user.companyId,
    };
    const token = await this.jwt.signAsync(payload);
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    return { token, expiresAt: new Date(exp * 1000), user };
  }
}
