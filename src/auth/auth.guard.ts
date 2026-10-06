import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DB, type Database } from '../database/database.module.js';
import { users } from '../database/schema.js';
import {
  audienceFor,
  type AuthUser,
  type JwtPayload,
  type Role,
} from './auth.types.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';
import { SESSION_COOKIE } from './session-cookie.js';

/** Global guard: every route requires a valid session cookie unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token)
      throw new UnauthorizedException('Требуется авторизация');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Сессия истекла, войдите снова');
    }

    // The DB is the source of truth, so blocking, a role change or a revoked
    // session applies on the next request instead of when the token expires.
    const [account] = await this.db
      .select({
        role: users.role,
        companyId: users.companyId,
        blockedAt: users.blockedAt,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, payload.sub));
    if (!account)
      throw new UnauthorizedException('Сессия истекла, войдите снова');
    // 401 makes the FE sign out; the code lets sign-in explain why. Checked
    // before the version, which blocking also bumps.
    if (account.blockedAt)
      throw new UnauthorizedException({
        message: 'Аккаунт заблокирован администратором',
        code: 'ACCOUNT_BLOCKED',
      });
    // A cabinet token can't become an admin session (or vice versa) even if
    // the role changes later: the user has to come in through the right door.
    if (
      payload.sv !== account.sessionVersion ||
      payload.aud !== audienceFor(account.role)
    )
      throw new UnauthorizedException('Сессия истекла, войдите снова');
    request.user = {
      id: payload.sub,
      role: account.role,
      companyId: account.companyId,
    };

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (roles?.length && !roles.includes(account.role))
      throw new ForbiddenException('Недостаточно прав для этого действия');
    return true;
  }
}
