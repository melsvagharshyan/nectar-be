import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MEDIA_URL } from '../uploads/media-url.js';

export const PROPERTY_TYPES = [
  'Квартира',
  'Студия',
  'Дом',
  'Пентхаус',
  'Участок',
  'Коммерция',
] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class ClientDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Укажите имя клиента' })
  @MaxLength(120)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Укажите телефон клиента' })
  @MaxLength(40)
  phone: string;

  @Transform(trim)
  @ValidateIf((o: ClientDto) => o.email !== '')
  @IsEmail({}, { message: 'Некорректный email' })
  email: string = '';

  @IsString()
  @IsNotEmpty({ message: 'Выберите ответственного сотрудника' })
  employeeId: string;
}

export class RequestDto {
  @IsIn(PROPERTY_TYPES, { message: 'Выберите тип недвижимости' })
  type: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Выберите хотя бы один район' })
  @ArrayMaxSize(30)
  @IsString({ each: true })
  districts: string[];

  @IsInt()
  @Min(0)
  budgetMin: number = 0;

  @IsInt()
  @Min(1, { message: 'Укажите максимальный бюджет' })
  budgetMax: number;

  @IsNumber()
  @Min(0)
  areaMin: number = 0;

  @IsNumber()
  @Min(0)
  areaMax: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  rooms: number | null = null;

  @Transform(trim) @IsString() @MaxLength(80) goal: string = '';
  @Transform(trim) @IsString() @MaxLength(80) term: string = '';
  @Transform(trim) @IsString() @MaxLength(2000) notes: string = '';
  @IsString() @MaxLength(40) market: string = '';
  @IsString() @MaxLength(40) repair: string = '';
  @IsString() @MaxLength(40) furniture: string = '';
  @IsString() @MaxLength(40) parking: string = '';
  @IsString() @MaxLength(40) view: string = '';

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  amenities: string[] = [];
}

export class PropertyDto {
  @IsBoolean()
  publish: boolean;

  @IsIn(PROPERTY_TYPES, { message: 'Выберите тип недвижимости' })
  type: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Выберите район' })
  @MaxLength(80)
  district: string;

  @IsInt()
  @Min(1, { message: 'Укажите цену' })
  price: number;

  @IsNumber()
  @Min(1, { message: 'Укажите площадь' })
  area: number;

  @IsOptional() @IsInt() @Min(0) rooms: number | null = null;
  @IsOptional() @IsInt() @Min(1) floor: number | null = null;
  @IsOptional() @IsInt() @Min(1) floors: number | null = null;
  @IsOptional() @IsNumber() @Min(0) ceiling: number | null = null;

  @IsString() @MaxLength(40) market: string = '';
  @Transform(trim) @IsString() @MaxLength(200) location: string = '';
  @Transform(trim) @IsString() @MaxLength(200) internalAddress: string = '';
  @Transform(trim) @IsString() @MaxLength(4000) description: string = '';
  @Transform(trim) @IsString() @MaxLength(4000) privateNotes: string = '';
  @IsString() @MaxLength(40) repair: string = '';
  @IsString() @MaxLength(40) furniture: string = '';
  @IsString() @MaxLength(40) parking: string = '';
  @IsString() @MaxLength(40) bathroom: string = '';
  @IsString() @MaxLength(40) balcony: string = '';
  @IsString() @MaxLength(40) building: string = '';

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  amenities: string[] = [];

  @IsArray()
  @ArrayMaxSize(20)
  @Matches(MEDIA_URL, { each: true, message: 'Некорректная ссылка на фото' })
  media: string[] = [];
}

export class CompanyDto {
  @IsIn(['rf', 'am'])
  kind: 'rf' | 'am';

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Укажите название компании' })
  @MaxLength(120)
  name: string;

  @Transform(trim)
  @IsString()
  @MaxLength(200)
  contact: string = '';
}

export class EmployeeDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Укажите имя сотрудника' })
  @MaxLength(120)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Укажите телефон сотрудника' })
  @MaxLength(40)
  phone: string;

  @IsBoolean()
  active: boolean = true;
}
