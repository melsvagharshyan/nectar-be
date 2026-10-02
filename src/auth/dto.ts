import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { Role } from './auth.types.js';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SignInDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Введите корректный email' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Введите пароль' })
  password: string;
}

export class SignUpDto {
  @IsIn(['broker', 'partner', 'admin'], { message: 'Выберите роль' })
  role: Role;

  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Имя должно содержать минимум 2 символа' })
  @MaxLength(120)
  name: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Введите корректный email' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Пароль должен содержать минимум 8 символов' })
  @MaxLength(128)
  password: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @Transform(trim)
  @ValidateIf((o: SignUpDto) => o.role !== 'admin')
  @IsString()
  @MinLength(2, { message: 'Укажите название компании' })
  @MaxLength(160)
  companyName?: string;

  @ValidateIf((o: SignUpDto) => o.role === 'admin')
  @IsString()
  @IsNotEmpty({ message: 'Введите код администратора' })
  adminCode?: string;
}
