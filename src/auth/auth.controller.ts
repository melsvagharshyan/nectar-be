import { Body, Controller, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import type { AuthResponse, AuthUser, IssuedSession } from './auth.types.js';
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

  @Public()
  @Post('sign-up')
  async signUp(
    @Body() dto: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.startSession(res, await this.auth.signUp(dto));
  }

  @Public()
  @HttpCode(200)
  @Post('sign-in')
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.startSession(res, await this.auth.signIn(dto));
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

  @HttpCode(204)
  @Post('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
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
