import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorQueryDto, PageQueryDto } from './pagination.js';

const STAGE_FILTERS = [
  'created',
  'in_progress',
  'has_offers',
  'crm',
  'sold',
  'attention',
] as const;
const AVAILABILITIES = ['active', 'draft', 'sold'] as const;
const OFFER_FILTERS = [
  'sent',
  'interested',
  'transferred',
  'closed',
  'unavailable',
  'closed_any',
] as const;
const ADMIN_VIEWS = ['active', 'crm', 'sold', 'offers', 'interested'] as const;

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class ClientsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  manager?: string;

  @IsOptional()
  @IsIn(STAGE_FILTERS)
  stage?: (typeof STAGE_FILTERS)[number];
}

export class RequestsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  company?: string;

  @IsOptional()
  @IsIn(STAGE_FILTERS)
  stage?: (typeof STAGE_FILTERS)[number];

  @IsOptional()
  @IsIn(['all', 'mine', 'open'])
  filter?: 'all' | 'mine' | 'open';
}

export class AdminRequestFilters extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ADMIN_VIEWS)
  view?: (typeof ADMIN_VIEWS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  partner?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  attention?: boolean;
}

export class OffersTableQueryDto extends AdminRequestFilters {
  @IsOptional()
  @IsIn(OFFER_FILTERS)
  state?: (typeof OFFER_FILTERS)[number];
}

/** Shared by the paged table (`page`) and the infinite feed (`cursor`). */
export class PropertiesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(AVAILABILITIES)
  status?: (typeof AVAILABILITIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  district?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  area?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rooms?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  company?: string;

  /** Restricts to active properties fitting this request's districts and budget. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  matchRequest?: string;
}

export class NotificationsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(['all', 'new', 'crm'])
  filter?: 'all' | 'new' | 'crm';
}

export class EventsQueryDto {
  @IsString()
  @MaxLength(40)
  requestId!: string;
}

export class CompaniesQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['rf', 'am'])
  kind?: 'rf' | 'am';
}