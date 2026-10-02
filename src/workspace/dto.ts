import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
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
