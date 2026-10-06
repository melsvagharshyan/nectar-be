import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { minutes, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import type {
  AuthResponse,
  AuthUser,
  IssuedSession,
  SignUpResponse,
} from './auth.types.js';
import { CurrentUser, Public } from './decorators.js';
import {
  ChangePasswordDto,
  SignInDto,
  SignUpDto,
  UpdateProfileDto,
} from './dto.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Files an application for admin review; no session is started. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @HttpCode(202)
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto): Promise<SignUpResponse> {
    return this.auth.signUp(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('sign-in')
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.startSession(res, await this.auth.signIn(dto));
  }

  /** Stricter than the cabinet door: admin accounts are worth more to guess. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @HttpCode(200)
  @Post('admin/sign-in')
  async adminSignIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.startSession(res, await this.auth.signIn(dto, true));
  }

  @Public()
  @HttpCode(204)
  @Post('sign-out')
  signOut(@Res({ passthrough: true }) res: Response) {
    clearSessionCookie(res, this.secureCookies);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getUser(user.id);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  /** Signs out every other device; this one gets a fresh cookie. */
  @HttpCode(204)
  @Post('password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, expiresAt } = await this.auth.changePassword(user.id, dto);
    setSessionCookie(res, token, expiresAt, this.secureCookies);
  }

  private get secureCookies() {
    return this.config.get('NODE_ENV') === 'production';
  }

  private startSession(
    res: Response,
    { token, expiresAt, user }: IssuedSession,
  ): AuthResponse {
    setSessionCookie(res, token, expiresAt, this.secureCookies);
    return { user };
  }
}
