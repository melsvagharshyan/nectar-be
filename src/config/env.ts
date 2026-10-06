import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  validateSync,
} from 'class-validator';

export class Env {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsOptional()
  @IsInt()
  PORT: number = 4000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  CORS_ORIGIN = 'http://localhost:5173';

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  /** Lifetime of broker/partner sessions. */
  @IsString()
  JWT_EXPIRES_IN = '7d';

  /** Admin sessions are shorter-lived: they can see and change everything. */
  @IsString()
  ADMIN_JWT_EXPIRES_IN = '12h';

  /** Express `trust proxy` value, e.g. `1` behind one reverse proxy; rate limits key on the client IP. */
  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;

  @Matches(/^cloudinary:\/\/[^:\s]+:[^@\s]+@[\w-]+$/, {
    message: 'CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>',
  })
  CLOUDINARY_URL: string;

  @IsString()
  CLOUDINARY_FOLDER = 'nectar/properties';

  @IsString()
  CLOUDINARY_AVATAR_FOLDER = 'nectar/avatars';
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  // `true` trusts the leftmost X-Forwarded-For, which the client writes, so
  // anyone could pick their own IP and walk past the auth rate limits.
  if (env.NODE_ENV === 'production' && env.TRUST_PROXY?.trim().toLowerCase() === 'true')
    throw new Error(
      'Invalid environment configuration:\nTRUST_PROXY: "true" lets clients spoof their IP; use the proxy hop count (e.g. 1) or its address',
    );
  return env;
}
