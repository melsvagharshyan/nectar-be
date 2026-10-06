import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginAttempts } from './login-attempts.js';

@Module({
  imports: [
    // Applied only where a route opts in with ThrottlerGuard (public auth routes).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: minutes(1), limit: 10 }],
      errorMessage: 'Слишком много попыток. Попробуйте через минуту.',
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      // Lifetime and audience depend on the role, so `AuthService.issue` sets them.
      useFactory: (config: ConfigService<Env, true>): JwtModuleOptions => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginAttempts,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
