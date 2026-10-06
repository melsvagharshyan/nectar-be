import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import { isUniqueViolation } from '../database/errors.js';
import {
  companies,
  employees,
  registrationRequests,
  users,
} from '../database/schema.js';
import {
  audienceFor,
  type IssuedSession,
  type JwtPayload,
  type SignUpResponse,
  type UserDto,
} from './auth.types.js';
import type {
  ChangePasswordDto,
  SignInDto,
  SignUpDto,
  UpdateProfileDto,
} from './dto.js';
import { LoginAttempts } from './login-attempts.js';
import { hashPassword, verifyPassword } from './password.js';

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

const invalidCredentials = () =>
  new UnauthorizedException('Неверный email или пароль');

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly attempts: LoginAttempts,
  ) {}

  /**
   * Answers the same way whether or not the email is taken, so the form can't
   * be used to find out who has an account or a pending application. A
   * duplicate is simply not filed; its owner signs in with their existing
   * password. The password is hashed on every path so timing doesn't tell either.
   */
  async signUp(dto: SignUpDto): Promise<SignUpResponse> {
    const accepted: SignUpResponse = { status: 'pending', email: dto.email };
    // The hash is copied unchanged into `users` when an admin approves.
    const passwordHash = await hashPassword(dto.password);
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email));
    if (existing) return accepted;

    try {
      await this.db.insert(registrationRequests).values({
        role: dto.role,
        email: dto.email,
        passwordHash,
        name: dto.name,
        phone: dto.phone ?? '',
        companyName: dto.companyName,
      });
    } catch (e) {
      // An application is already pending (the partial unique index also
      // closes the double-submit race).
      if (isUniqueViolation(e, 'registration_requests_pending_email_uq'))
        return accepted;
      throw e;
    }
    return accepted;
  }

  /**
   * Admins sign in only through `/auth/admin/sign-in`, everyone else only
   * through `/auth/sign-in`; the wrong door looks like a wrong password.
   */
  async signIn(dto: SignInDto, asAdmin = false): Promise<IssuedSession> {
    // Refused before any hashing, so a locked email costs no scrypt work.
    this.attempts.assertAllowed(dto.email);
    const wrongPassword = () => {
      this.attempts.recordFailure(dto.email);
      return invalidCredentials();
    };

    const [user] = await this.db
      .select({
        id: users.id,
        role: users.role,
        passwordHash: users.passwordHash,
        blockedAt: users.blockedAt,
        blockReason: users.blockReason,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.email, dto.email));
    if (user) {
      if (!(await verifyPassword(dto.password, user.passwordHash)))
        throw wrongPassword();
      if ((user.role === 'admin') !== asAdmin) throw wrongPassword();
      if (user.blockedAt)
        throw new ForbiddenException({
          message: 'Аккаунт заблокирован администратором',
          code: 'ACCOUNT_BLOCKED',
          reason: user.blockReason,
        });
      this.attempts.reset(dto.email);
      return this.issue(await this.getUser(user.id), user.sessionVersion);
    }

    // Applications are never for admins.
    if (asAdmin) {
      await verifyPassword(dto.password, await DUMMY_HASH);
      throw wrongPassword();
    }

    // No account yet: the status is revealed only for the right password.
    const [application] = await this.db
      .select({
        status: registrationRequests.status,
        passwordHash: registrationRequests.passwordHash,
        rejectReason: registrationRequests.rejectReason,
      })
      .from(registrationRequests)
      .where(
        and(
          eq(registrationRequests.email, dto.email),
          inArray(registrationRequests.status, ['pending', 'rejected']),
        ),
      )
      .orderBy(desc(registrationRequests.createdAt))
      .limit(1);
    // Hash against a dummy when nothing matches so timing doesn't leak emails.
    const matches = await verifyPassword(
      dto.password,
      application?.passwordHash ?? (await DUMMY_HASH),
    );
    if (!application || !matches) throw wrongPassword();
    if (application.status === 'pending')
      throw new ForbiddenException({
        message:
          'Ваша заявка на рассмотрении. Мы откроем доступ после проверки администратором.',
        code: 'REGISTRATION_PENDING',
      });
    throw new ForbiddenException({
      message: 'Заявка на регистрацию отклонена',
      code: 'REGISTRATION_REJECTED',
      reason: application.rejectReason,
    });
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

  /**
   * Revokes every session of the account, then issues a fresh one so the
   * device that changed the password stays signed in.
   */
  async changePassword(id: string, dto: ChangePasswordDto): Promise<IssuedSession> {
    const [user] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, id));
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash)))
      throw new BadRequestException('Текущий пароль указан неверно');
    if (dto.currentPassword === dto.newPassword)
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    const [updated] = await this.db
      .update(users)
      .set({
        passwordHash: await hashPassword(dto.newPassword),
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, id))
      .returning({ sessionVersion: users.sessionVersion });
    if (!updated) throw new NotFoundException('Пользователь не найден');
    return this.issue(await this.getUser(id), updated.sessionVersion);
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

  private async issue(user: UserDto, sessionVersion: number): Promise<IssuedSession> {
    const audience = audienceFor(user.role);
    const expiresIn = this.config.get(
      audience === 'admin' ? 'ADMIN_JWT_EXPIRES_IN' : 'JWT_EXPIRES_IN',
    ) as NonNullable<JwtSignOptions['expiresIn']>;
    // `aud` goes through the options: jsonwebtoken refuses it in both places.
    const payload: Omit<JwtPayload, 'aud'> = { sub: user.id, sv: sessionVersion };
    const token = await this.jwt.signAsync(payload, { audience, expiresIn });
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    return { token, expiresAt: new Date(exp * 1000), user };
  }
}
