import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../common/validators/date-only';
import { IsOnOrAfter } from '../../common/validators/is-on-or-after.validator';
import { SUPPORTED_CURRENCIES } from '../currencies';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Optional text fields: treat "" the same as not sent
const trimOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() || undefined;
};

export class CustomerDto {
  @ApiProperty({ example: 'Paul' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullname: string;

  @ApiProperty({ example: 'paul@101digital.io' })
  @Transform(trim)
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '947717364111' })
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobileNumber?: string;

  @ApiPropertyOptional({ example: 'Singapore' })
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

export class CreateInvoiceItemDto {
  @ApiProperty({ example: 'Honda RC150' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 1000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  rate: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: 'IV1780488206995' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  invoiceNumber: string;

  @ApiPropertyOptional({ example: '#5721662' })
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceReference?: string;

  @ApiProperty({ example: '2026-06-03', format: 'date' })
  @IsDateOnly()
  invoiceDate: string;

  @ApiProperty({ example: '2026-07-03', format: 'date' })
  @IsDateOnly()
  @IsOnOrAfter('invoiceDate')
  dueDate: string;

  @ApiProperty({ enum: SUPPORTED_CURRENCIES, example: 'AUD' })
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string;

  @ApiPropertyOptional({ example: 'Invoice is issued to Kanglee' })
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ type: CustomerDto })
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @ApiProperty({
    type: [CreateInvoiceItemDto],
    description: 'Exactly one item for now',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @ApiPropertyOptional({ description: 'Tax percentage', default: 10 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate: number = 10;

  @ApiPropertyOptional({ description: 'Flat discount amount', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount: number = 0;
}
