import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { isUniqueViolation } from '../database/errors.js';
import {
  companies,
  employees,
  registrationRequests,
  users,
} from '../database/schema.js';
import type {
  IssuedSession,
  JwtPayload,
  SignUpResponse,
  UserDto,
} from './auth.types.js';
import type {
  ChangePasswordDto,
  SignInDto,
  SignUpDto,
  UpdateProfileDto,
} from './dto.js';
import { hashPassword, verifyPassword } from './password.js';

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

const invalidCredentials = () =>
  new UnauthorizedException('Неверный email или пароль');

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async signUp(dto: SignUpDto): Promise<SignUpResponse> {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email));
    if (existing)
      throw new ConflictException('Пользователь с таким email уже существует');

    // The hash is copied unchanged into `users` when an admin approves.
    const passwordHash = await hashPassword(dto.password);
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
      // The partial unique index closes the double-submit race.
      if (isUniqueViolation(e, 'registration_requests_pending_email_uq'))
        throw new ConflictException('Заявка с этим email уже на рассмотрении');
      throw e;
    }
    return { status: 'pending', email: dto.email };
  }

  /**
   * Admins sign in only through `/auth/admin/sign-in`, everyone else only
   * through `/auth/sign-in`; the wrong door looks like a wrong password.
   */
  async signIn(dto: SignInDto, asAdmin = false): Promise<IssuedSession> {
    const [user] = await this.db
      .select({
        id: users.id,
        role: users.role,
        passwordHash: users.passwordHash,
        blockedAt: users.blockedAt,
        blockReason: users.blockReason,
      })
      .from(users)
      .where(eq(users.email, dto.email));
    if (user) {
      if (!(await verifyPassword(dto.password, user.passwordHash)))
        throw invalidCredentials();
      if ((user.role === 'admin') !== asAdmin) throw invalidCredentials();
      if (user.blockedAt)
        throw new ForbiddenException({
          message: 'Аккаунт заблокирован администратором',
          code: 'ACCOUNT_BLOCKED',
          reason: user.blockReason,
        });
      return this.issue(await this.getUser(user.id));
    }

    // Applications are never for admins.
    if (asAdmin) {
      await verifyPassword(dto.password, await DUMMY_HASH);
      throw invalidCredentials();
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
    if (!application || !matches) throw invalidCredentials();
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
