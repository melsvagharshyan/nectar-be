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

  @IsString()
  JWT_EXPIRES_IN = '7d';

  @IsString()
  @MinLength(6)
  ADMIN_SIGNUP_CODE: string;

  @Matches(/^cloudinary:\/\/[^:\s]+:[^@\s]+@[\w-]+$/, {
    message: 'CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>',
  })
  CLOUDINARY_URL: string;

  @IsString()
  CLOUDINARY_FOLDER = 'nectar/properties';
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
  return env;
}
