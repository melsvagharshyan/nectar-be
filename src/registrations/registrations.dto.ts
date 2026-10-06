import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { SignUpRole } from '../auth/auth.types.js';
import { CursorQueryDto } from '../workspace/pagination.js';
import type { RegistrationStatus } from './registrations.types.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegistrationsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status: RegistrationStatus = 'pending';

  @IsOptional()
  @IsIn(['broker', 'partner'])
  role?: SignUpRole;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class RejectRegistrationDto {
  // The applicant sees this text when they try to sign in.
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Укажите причину отказа' })
  @MaxLength(500)
  reason: string;
}
