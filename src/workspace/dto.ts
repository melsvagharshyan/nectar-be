import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class InterestDto {
  @IsOptional()
  @IsBoolean()
  selected?: boolean;
}

export class SendOffersDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  propertyIds?: string[];
}

export class SellDto {
  @IsString()
  propertyId: string;
}

/** Admin's rejection of a request, offer or reservation; shown to its author. */
export class ReviewRejectDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3, { message: 'Укажите причину отказа' })
  @MaxLength(500)
  reason: string;
}
