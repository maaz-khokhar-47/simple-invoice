import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, WriteOffReason } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDateOnly } from '../../common/validators/date-only';
import { SUPPORTED_CURRENCIES } from '../currencies';
import { SHORTFALL_WRITE_OFF_REASONS } from '../invoice-lifecycle';

/**
 * Settled against the invoice = amountReceived x exchangeRate + taxWithheld,
 * which cannot exceed the balance.
 */
export class CreatePaymentDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.BankTransfer })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({
    example: 500,
    description: 'Amount that arrived, in the payment currency',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountReceived: number;

  @ApiPropertyOptional({
    enum: SUPPORTED_CURRENCIES,
    example: 'USD',
    description:
      'Currency the money arrived in. Defaults to the invoice currency',
  })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;

  @ApiPropertyOptional({
    example: 1.52,
    description:
      '1 unit of the payment currency in the invoice currency. Required when the currencies differ; must be 1 (or omitted) when they are the same',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  exchangeRate?: number;

  @ApiPropertyOptional({
    example: 76,
    default: 0,
    description:
      'Tax the customer withheld (TDS / withholding tax), in the invoice currency. It counts towards the invoice',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxWithheld: number = 0;

  @ApiProperty({ example: '2026-10-09', format: 'date' })
  @IsDateOnly()
  paidAt: string;

  @ApiPropertyOptional({ example: 'Ref 88231' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Write off whatever this payment leaves unpaid (bank charges, rounding...) and close the invoice as Paid',
  })
  @IsOptional()
  @IsBoolean()
  writeOffRest?: boolean;

  @ApiPropertyOptional({
    enum: SHORTFALL_WRITE_OFF_REASONS,
    description: 'Required with writeOffRest',
  })
  @IsOptional()
  @IsIn(SHORTFALL_WRITE_OFF_REASONS)
  writeOffReason?: WriteOffReason;

  @ApiPropertyOptional({
    example: 'Intermediary bank fee',
    description: 'Required when writeOffReason is Other',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  writeOffNote?: string;
}
